#!/usr/bin/env python3
"""
Синхронизация блокировок с Google Sheets.

Источник: https://docs.google.com/spreadsheets/d/1ZKOPBsD9x4wdlC5rDjz09UypD86G0Cee/edit
          (файл «Перечень КИП ИОС рабочий.xlsx», импортированный в Google Sheets,
           тот же что и для приборов)
Лист: "Блокировки_app"

Скрипт работает по тому же принципу, что и scripts/sync-devices.py
(раздел «Приборы»):

  1. Скачивает XLSX-экспорт напрямую из Google Sheets через export?format=xlsx.
     Google отдаёт файл без OAuth, если таблица доступна «у кого есть ссылка».
  2. Парсит лист "Блокировки_app" — заголовки в 1-й строке, данные со 2-й.
  3. Сохраняет результат в data/lockouts.json.

Переменные окружения:
  LOCKOUTS_SPREADSHEET_ID — ID Google Sheets
      (по умолчанию 1ZKOPBsD9x4wdlC5rDjz09UypD86G0Cee)
  LOCKOUTS_SHEET_NAME — имя листа (по умолчанию "Блокировки_app")
  LOCKOUTS_GID — numeric ID листа (опционально; если задан, экспортирует
      конкретный лист через &gid=...). Если не задан — экспортируется вся книга.

Секреты НЕ требуются — таблица доступна «у кого есть ссылка»,
Google отдаёт XLSX через export?format=xlsx без OAuth.

Если нет интернета или API недоступен — используется уже существующий
data/lockouts.json как заглушка (PWA продолжает работать с последними
закоммиченными данными).
"""

import os
import sys
import json
import re
from pathlib import Path
from datetime import datetime, time as dtime, date as ddate

import requests
import openpyxl


# ============================================================
# Настройки Google Sheets
# ============================================================
DEFAULT_SPREADSHEET_ID = '1ZKOPBsD9x4wdlC5rDjz09UypD86G0Cee'
DEFAULT_SHEET_NAME = 'Блокировки_app'

DOWNLOAD_DIR = Path('/tmp/lockouts_download')
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
JSON_OUT = PROJECT_ROOT / 'data' / 'lockouts.json'

# Task 484: счётчики ППР для графика «как в Excel» (по образцу
# sync-devices.py Task 483). Считаются по ИСХОДНОМУ листу «Блокировки»
# (не «Блокировки_app»: месячные колонки I..XII и колонка «Наличие
# в перечне и в ППР» есть только на исходном листе).
# Виды ремонта на листе: «Кр» (капитальный ремонт схем) и «ТО»
# (тех. обслуживание) — метки месяцев, точное совпадение.
# Task 485: расшифровка «Кр» — «Кап. ремонт» (в 484 была опечатка
# «Кан.»; заявка: вид обслуживания — «Кап. ремонт»).
PPR_MONTH_COLS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
PPR_TYPES = ['Кр', 'ТО']
PPR_TYPE_NAMES = {'Кр': 'Кап. ремонт', 'ТО': 'Тех. обслуж.'}
PPR_FILTER_COL = 'Наличие в перечне и в ППР'
PPR_CHART_SHEET = 'Блокировки'


def log(msg):
    print(f'[lockouts] {msg}', flush=True)


# ============================================================
# Восстановление числового значения из «даты/времени»
# ============================================================
# В Google Sheets числовые колонки иногда имеют формат Date/Time.
# openpyxl с data_only=True возвращает datetime/time вместо числа.
# Решение: конвертируем datetime/time обратно в Excel serial number.
# Эпоха 1899-12-30 = 1900 date system (как в Google Sheets и Excel).
DATE_EPOCH = datetime(1899, 12, 30)

def datetime_to_serial(val):
    """Конвертирует datetime/time/date в Excel serial number (float).
    Возвращает None, если конвертация неприменима.
    """
    if isinstance(val, datetime):
        delta = val - DATE_EPOCH
        return round(delta.total_seconds() / 86400.0, 6)
    if isinstance(val, dtime):
        secs = val.hour * 3600 + val.minute * 60 + val.second + val.microsecond / 1e6
        return round(secs / 86400.0, 6)
    if isinstance(val, ddate):
        delta = datetime(val.year, val.month, val.day) - DATE_EPOCH
        return round(delta.total_seconds() / 86400.0, 6)
    return None


def format_serial_as_string(serial):
    """Форматирует serial number: int если целое, иначе trimmed float."""
    if abs(serial - round(serial)) < 1e-9:
        return str(int(round(serial)))
    return f'{serial:.4f}'.rstrip('0').rstrip('.')


# ============================================================
# Скачивание XLSX напрямую из Google Sheets
# (по образцу scripts/sync-devices.py / sync-projects.py)
# ============================================================
def download_file(spreadsheet_id, gid=None):
    """
    Скачивает XLSX-экспорт Google Sheets.

    URL: https://docs.google.com/spreadsheets/d/<ID>/export?format=xlsx[&gid=<GID>]
    Если gid не задан — экспортируется вся книга (все листы).
    """
    url = f'https://docs.google.com/spreadsheets/d/{spreadsheet_id}/export?format=xlsx'
    if gid:
        url += f'&gid={gid}'

    log(f'Скачивание: {url[:100]}...')
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
    resp = requests.get(url, headers=headers, timeout=120, allow_redirects=True)
    if resp.status_code != 200:
        raise RuntimeError(f'Ошибка скачивания: HTTP {resp.status_code} — {resp.text[:200]}')

    # Проверяем, что это xlsx (ZIP, начинается с PK)
    if resp.content[:2] != b'PK':
        raise RuntimeError(
            f'Скачанный файл не является xlsx (не ZIP). '
            f'Первые байты: {resp.content[:4]!r}. '
            f'Возможно, таблица не опубликована или нет доступа.'
        )

    filename = 'lockouts.xlsx'
    local_path = DOWNLOAD_DIR / filename
    local_path.write_bytes(resp.content)
    file_size = local_path.stat().st_size
    log(f'Файл скачан: {local_path} ({file_size} байт)')
    return local_path


# ============================================================
# Task 484: счётчики ППР по листу «Блокировки» → блок ppr_chart
# (по образцу parse_ppr_chart из sync-devices.py Task 483)
# ============================================================
def parse_ppr_chart(xlsx_path, sheet_name=PPR_CHART_SHEET):
    """Считает ppr_chart: по каждому месяцу I..XII — количество
    обслуживаний каждого вида Кр/ТО ТОЛЬКО у строк со значением
    «Наличие в перечне и в ППР» = «Есть» (регистронезависимо, с
    trim; «Нет» и пусто — НЕ учитываются; заявка Task 484: тот же
    подсчёт, что во вкладке «Приборы»). Возвращает dict или None,
    если листа/колонок нет (например, экспорт с gid= только
    «Блокировки_app») — тогда вызывающая сторона сохранит прежний
    блок, если он был."""
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    if sheet_name not in wb.sheetnames:
        log(f'Лист "{sheet_name}" не найден — ppr_chart пропущен. '
            f'Листы: {wb.sheetnames}')
        return None
    ws = wb[sheet_name]
    headers = [str(c.value).strip() if c.value is not None else '' for c in ws[1]]
    mcols = {}
    for idx, h in enumerate(headers, 1):
        if h in PPR_MONTH_COLS:
            mcols[h] = idx
    col_ppr = headers.index(PPR_FILTER_COL) + 1 if PPR_FILTER_COL in headers else None
    if len(mcols) != 12 or col_ppr is None:
        log(f'Лист "{sheet_name}": нет 12 месячных колонок или '
            f'«{PPR_FILTER_COL}» (колонки: {len(mcols)}/12, ППР: {col_ppr}) '
            f'— ppr_chart пропущен')
        return None

    counts = {t: [0] * 12 for t in PPR_TYPES}
    # COUNTIF-семантика (как в Task 483): совпадение кода — точное,
    # но регистронезависимое («Кр»/«КР»/«кр» — один вид; в 483 все
    # коды «К»/«П»/«ТО» были однорегистровыми и хватало .upper(),
    # для смешанного «Кр» нормализуем ОБЕ стороны сравнения)
    type_norm = {t.upper(): t for t in PPR_TYPES}
    rows_in_ppr = 0
    for r in range(2, ws.max_row + 1):
        ppr_val = str(ws.cell(row=r, column=col_ppr).value or '').strip().lower()
        if ppr_val != 'есть':
            continue  # «Нет»/пусто — НЕ учитываются (заявка Task 484)
        rows_in_ppr += 1
        for mi, m in enumerate(PPR_MONTH_COLS):
            v = str(ws.cell(row=r, column=mcols[m]).value or '').strip().upper()
            t = type_norm.get(v)
            if t:  # точное совпадение Кр/ТО (регистронезависимо)
                counts[t][mi] += 1

    year = datetime.now().year
    series = []
    for t in PPR_TYPES:
        series.append({
            'code': t,
            'name': PPR_TYPE_NAMES[t],
            'values': counts[t],
        })
    total_marks = sum(sum(counts[t]) for t in PPR_TYPES)
    log(f'ppr_chart: год {year}, строк с «{PPR_FILTER_COL}» = «Есть»: '
        f'{rows_in_ppr}, пометок учтено: {total_marks} '
        f'(Кр {sum(counts["Кр"])}, ТО {sum(counts["ТО"])})')
    return {
        'year': year,
        'filter': f'{PPR_FILTER_COL} = Есть',
        'source_sheet': sheet_name,
        'series': series,
    }


# ============================================================
# Парсинг листа Блокировки_app → data/lockouts.json
# ============================================================
def parse_lockouts(xlsx_path, sheet_name):
    """
    Парсит лист sheet_name из XLSX-файла.
    Заголовки — в 1-й строке, данные — начиная со 2-й.
    Пропускает строки без ID и без Параметра.
    """
    log(f'Парсинг листа "{sheet_name}" из {xlsx_path}')
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    if sheet_name not in wb.sheetnames:
        raise RuntimeError(
            f'Лист "{sheet_name}" не найден. Доступные листы: {wb.sheetnames}'
        )

    ws = wb[sheet_name]
    log(f'Размер листа: {ws.max_row} строк × {ws.max_column} колонок')

    # Читаем заголовки из 1-й строки
    headers = []
    for cell in ws[1]:
        val = str(cell.value).strip() if cell.value is not None else ''
        headers.append(val)
    log(f'Заголовки ({len(headers)}): {headers}')

    # Читаем данные
    # Определяем, какие колонки должны быть числами (по заголовку).
    # В Google Sheets эти колонки иногда имеют формат Date/Time по ошибке,
    # и openpyxl возвращает datetime/time вместо числа. В таком случае
    # конвертируем datetime/time обратно в Excel serial number.
    # Внимание: «Дата проверки» сюда НЕ входит — это настоящая дата.
    NUMERIC_HEADERS_HINTS = ('ID', 'Уставка', 'Значение сигнала', '№ СБС',
                             '№ проекта')

    def is_numeric_header(h):
        if not h:
            return False
        for hint in NUMERIC_HEADERS_HINTS:
            if hint in h:
                return True
        return False

    numeric_cols = set()
    for idx, h in enumerate(headers, 1):
        if is_numeric_header(h):
            numeric_cols.add(idx)
    if numeric_cols:
        log(f'Числовые колонки (по заголовку): {sorted(numeric_cols)} '
            f'→ {[headers[i-1] for i in sorted(numeric_cols)]}')

    lockouts = []
    skipped = 0
    for row_idx in range(2, ws.max_row + 1):
        row_values = []
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=row_idx, column=col_idx)
            val = cell.value

            # Если колонка должна быть числовой, но значение — datetime/time,
            # восстанавливаем исходное число (Excel serial number).
            if col_idx in numeric_cols and val is not None:
                serial = datetime_to_serial(val)
                if serial is not None:
                    val = format_serial_as_string(serial)
                    row_values.append(val)
                    continue

            # Обработка дат для НЕчисловых колонок (например, «Дата проверки»)
            if isinstance(val, datetime):
                val = val.strftime('%Y-%m-%d')
            elif val is not None:
                val = str(val).strip()
                # Убираем мягкие переносы и нормализуем пробелы
                val = val.replace('\xad', '').replace('\u00a0', ' ')
                val = re.sub(r'\s+', ' ', val).strip()
            else:
                val = ''
            row_values.append(val)

        # Создаём словарь "заголовок → значение"
        record = {}
        for h, v in zip(headers, row_values):
            if h:  # пропускаем пустые заголовки
                record[h] = v

        # Пропускаем строки без ID и без Параметра
        id_val = record.get('ID', '').strip() if isinstance(record.get('ID'), str) else record.get('ID')
        param_val = record.get('Параметр', '').strip() if isinstance(record.get('Параметр'), str) else record.get('Параметр')
        if (id_val == '' or id_val is None) and (param_val == '' or param_val is None):
            skipped += 1
            continue

        # Если ID — число, преобразуем
        if isinstance(id_val, str) and id_val.isdigit():
            record['ID'] = int(id_val)

        lockouts.append(record)

    log(f'Распарсено записей: {len(lockouts)}, пропущено: {skipped}')
    return lockouts, headers


def main():
    spreadsheet_id = os.environ.get('LOCKOUTS_SPREADSHEET_ID', '').strip() or DEFAULT_SPREADSHEET_ID
    sheet_name = os.environ.get('LOCKOUTS_SHEET_NAME', '').strip() or DEFAULT_SHEET_NAME
    gid = os.environ.get('LOCKOUTS_GID', '').strip() or None

    try:
        # 1. Скачать XLSX из Google Sheets
        local_file = download_file(spreadsheet_id, gid=gid)

        # 2. Распарсить лист
        lockouts, headers = parse_lockouts(local_file, sheet_name)

        # 2a. Task 484: посчитать ppr_chart по исходному листу
        #     «Блокировки» (месячные пометки I..XII с фильтром
        #     «Наличие в перечне и в ППР» = «Есть» — тот же подсчёт,
        #     что во вкладке «Приборы», Task 483). Если лист
        #     недоступен (экспорт по gid= одного листа) — сохранить
        #     прежний блок, если он был.
        ppr_chart = parse_ppr_chart(local_file, PPR_CHART_SHEET)
        if ppr_chart is None and JSON_OUT.exists():
            try:
                with open(JSON_OUT, encoding='utf-8') as f:
                    ppr_chart = json.load(f).get('ppr_chart')
                if ppr_chart:
                    log('ppr_chart: лист «Блокировки» недоступен — '
                        'сохранён прежний блок')
            except Exception as e:
                log(f'ppr_chart: прежний блок не прочитан ({e})')
                ppr_chart = None

        # 3. Сохранить JSON
        out = {
            'title': 'Блокировки по производствам',
            'source': f'Google Sheets: https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit',
            'sheet': sheet_name,
            'total_lockouts': len(lockouts),
            'headers': headers,
        }
        if ppr_chart is not None:
            out['ppr_chart'] = ppr_chart
        out['lockouts'] = lockouts
        JSON_OUT.parent.mkdir(parents=True, exist_ok=True)
        with open(JSON_OUT, 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
        log(f'JSON сохранён: {JSON_OUT}')
        log(f'Всего блокировок: {len(lockouts)}')

        return 0

    except Exception as e:
        log(f'ОШИБКА: {e}')
        import traceback
        traceback.print_exc()
        # Если файл уже существует — не падать (используем как заглушку)
        if JSON_OUT.exists():
            log(f'Используется существующий файл: {JSON_OUT}')
            return 0
        return 1


if __name__ == '__main__':
    sys.exit(main())

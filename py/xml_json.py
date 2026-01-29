import zipfile
import json
import os
from lxml import etree as ET
import traceback
import sys
import sqlite3
import gc
import psutil

# --- ОПТИМИЗИРОВАННАЯ КОНФИГУРАЦИЯ ДЛЯ 8GB RAM ---
OUTPUT_DIR = "output_data"
LOG_LEVEL = "DEBUG"  # Включаем детальное логирование
BATCH_SIZE = 50           
MEMORY_LIMIT_MB = 300     
GC_FREQUENCY = 200        
PROGRESS_FREQUENCY = 2000 

# --- Функции ---

def log_message(level, message):
    if LOG_LEVEL == "DEBUG" or \
       (LOG_LEVEL == "INFO" and level != "DEBUG") or \
       level == "ERROR":
        print(f"LOG_{level}: {message}")

def get_memory_usage():
    """Возвращает использование памяти в МБ"""
    try:
        process = psutil.Process(os.getpid())
        return process.memory_info().rss / 1024 / 1024
    except:
        return 0

def setup_database(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute('CREATE TABLE IF NOT EXISTS objects (id TEXT PRIMARY KEY, type TEXT NOT NULL, contours TEXT NOT NULL)')
    cursor.execute('CREATE TABLE IF NOT EXISTS processing_state (key TEXT PRIMARY KEY, value INTEGER)')
    # Оптимизация SQLite для больших объемов
    cursor.execute('PRAGMA journal_mode=WAL')
    cursor.execute('PRAGMA synchronous=NORMAL')
    cursor.execute('PRAGMA cache_size=10000')
    cursor.execute('PRAGMA temp_store=MEMORY')
    conn.commit()
    return conn

def commit_batch_optimized(cursor, batch_data):
    """Оптимизированная запись с минимальным потреблением памяти"""
    if not batch_data: 
        return True
    
    try:
        for obj_id, obj_type, contours_json in batch_data:
            cursor.execute('INSERT OR IGNORE INTO objects (id, type, contours) VALUES (?, ?, ?)', 
                         (obj_id, obj_type, contours_json))
        return True
    except (sqlite3.Error, MemoryError) as e:
        log_message("ERROR", f"Ошибка записи в БД: {e}")
        return False

def analyze_xml_structure(elem, record_number):
    """Детальный анализ структуры XML элемента"""
    log_message("DEBUG", f"=== АНАЛИЗ СТРУКТУРЫ XML ЗАПИСИ #{record_number} ===")
    xml_text = ET.tostring(elem, encoding='unicode', pretty_print=True)
    log_message("DEBUG", f"Полный XML элемента:\n{xml_text[:3000]}...")
    log_message("DEBUG", "=== ПОИСК КАДАСТРОВОГО НОМЕРА ===")
    cad_variants = [
        ('.//object/common_data/cad_number/text()', 'Через object/common_data'),
        ('.//*[local-name()="object"]//*[local-name()="common_data"]//*[local-name()="cad_number"]/text()', 'Через object/common_data с local-name'),
    ]
    for xpath_expr, description in cad_variants:
        try:
            result = elem.xpath(xpath_expr)
            log_message("DEBUG", f"{description}: {result}")
        except Exception as e:
            log_message("DEBUG", f"{description}: ОШИБКА - {e}")
    log_message("DEBUG", "=== ПОИСК КООРДИНАТ ====")
    coord_variants = [
        ('.//contour', 'Поиск contour'),
        ('.//spatial_element', 'Поиск spatial_element'),
    ]
    for xpath_expr, description in coord_variants:
        try:
            result = elem.xpath(xpath_expr)
            log_message("DEBUG", f"{description}: найдено {len(result)} элементов")
        except Exception as e:
            log_message("DEBUG", f"{description}: ОШИБКА - {e}")
    log_message("DEBUG", "=== КОНЕЦ АНАЛИЗА ===\n")

def extract_coordinates_from_element(elem):
    """
    [ИСПРАВЛЕНО v2] Извлекает все контуры, их части (spatial_element) и доп. атрибуты точек.
    """
    all_contours_parts = []
    
    # Ищем все элементы <contour>
    contour_elements = (
        elem.xpath('.//contours/contour') or
        elem.xpath('.//*[local-name()="contours"]/*[local-name()="contour"]')
    )

    for contour_elem in contour_elements:
        # Внутри одного <contour> может быть несколько <spatial_element>
        spatial_elements = (
            contour_elem.xpath('.//spatial_element') or
            contour_elem.xpath('.//*[local-name()="spatial_element"]')
        )
        
        for sp_element in spatial_elements:
            points = []
            ordinates = (
                sp_element.xpath('.//ordinate') or
                sp_element.xpath('.//*[local-name()="ordinate"]')
            )
            
            for ordinate_elem in ordinates:
                x_nodes = ordinate_elem.xpath('./x/text()') or ordinate_elem.xpath('./*[local-name()="x"]/text()')
                y_nodes = ordinate_elem.xpath('./y/text()') or ordinate_elem.xpath('./*[local-name()="y"]/text()')
                delta_nodes = ordinate_elem.xpath('./delta_geopoint/text()') or ordinate_elem.xpath('./*[local-name()="delta_geopoint"]/text()')

                if x_nodes and y_nodes:
                    try:
                        point_data = {
                            'x': float(x_nodes[0].replace(',', '.')),
                            'y': float(y_nodes[0].replace(',', '.'))
                        }
                        
                        # Добавляем delta_geopoint, если он есть
                        if delta_nodes:
                            point_data['delta'] = float(delta_nodes[0].replace(',', '.'))
                        
                        points.append(point_data)
                    except (ValueError, TypeError):
                        continue
            
            if points:
                all_contours_parts.append(points)
    
    return all_contours_parts


def extract_cadastral_number(elem):
    """Извлекает кадастровый номер с несколькими вариантами поиска"""
    cad_number_variants = [
        elem.xpath('.//object/common_data/cad_number/text()'),
        elem.xpath('.//*[local-name()="object"]/*[local-name()="common_data"]/*[local-name()="cad_number"]/text()'),
    ]
    
    for variant in cad_number_variants:
        if variant:
            return variant[0].strip()
    return None

def parse_xml_optimized(xml_file_path, conn, total_xml_size):
    cursor = conn.cursor()
    cursor.execute('SELECT value FROM processing_state WHERE key = "last_processed_elements"')
    result = cursor.fetchone()
    last_processed_elements = result[0] if result else 0
    
    log_message("INFO", f"Начинаем с элемента: {last_processed_elements}")
    cursor.execute('SELECT COUNT(*) FROM objects')
    existing_count = cursor.fetchone()[0]
    log_message("INFO", f"Объектов уже в БД: {existing_count}")

    batch_data = []
    elements_processed = 0
    last_checkpoint_elements = last_processed_elements
    
    log_message("INFO", "Начало извлечения данных...")
    found_records = 0
    found_with_cad = 0
    found_with_coords = 0
    
    try:
        with open(xml_file_path, 'rb') as xml_stream:
            context = ET.iterparse(xml_stream, events=('end',), recover=True)
            
            for event, elem in context:
                elements_processed += 1
                
                if elements_processed <= last_processed_elements:
                    elem.clear()
                    parent = elem.getparent()
                    if parent is not None:
                        while elem.getprevious() is not None:
                            del parent[0]
                    continue
                
                if elements_processed % GC_FREQUENCY == 0: gc.collect()
                
                if elements_processed % PROGRESS_FREQUENCY == 0:
                    memory_mb = get_memory_usage()
                    try:
                        current_byte = xml_stream.tell()
                        percent = (current_byte / total_xml_size) * 100
                        sys.stdout.write(f"\rПрогресс: {percent:.2f}% | Элементов: {elements_processed} | Найдено записей: {found_records} | С координатами: {found_with_coords} | RAM: {memory_mb:.0f}MB")
                    except:
                        sys.stdout.write(f"\rЭлементов: {elements_processed} | Найдено записей: {found_records} | С координатами: {found_with_coords} | RAM: {memory_mb:.0f}MB")
                    sys.stdout.flush()

                tag_name = ET.QName(elem).localname
                
                if tag_name in ['land_record', 'build_record', 'construction_record']:
                    try:
                        found_records += 1
                        
                        if found_records <= 3:
                            log_message("INFO", f"Найдена запись типа: {tag_name}")
                            analyze_xml_structure(elem, found_records)
                        
                        cad_number = extract_cadastral_number(elem)
                        
                        if cad_number:
                            found_with_cad += 1
                            if found_with_cad <= 5:
                                log_message("INFO", f"Найден кадастровый номер: {cad_number}")
                        else:
                            cad_number = f"unknown_object_{elements_processed}_{found_records}"
                            if found_records <= 10:
                                log_message("INFO", f"Кадастровый номер не найден, используем: {cad_number}")

                        cursor.execute('SELECT 1 FROM objects WHERE id = ? LIMIT 1', (cad_number,))
                        if cursor.fetchone():
                            continue
                        
                        contours = extract_coordinates_from_element(elem)
                        
                        if contours:
                            found_with_coords += 1
                            if found_with_coords <= 5:
                                log_message("INFO", f"Найдены координаты для {cad_number}: {len(contours)} контуров/частей, первая часть содержит {len(contours[0])} точек")
                            
                            object_type_map = {'land_record': 'parcel', 'build_record': 'building', 'construction_record': 'construction'}
                            obj_type = object_type_map[tag_name]
                            contours_json = json.dumps(contours, separators=(',', ':'))
                            batch_data.append((cad_number, obj_type, contours_json))
                        elif found_records <= 10:
                            log_message("INFO", f"Координаты не найдены для {cad_number}")
                        
                        if len(batch_data) >= BATCH_SIZE:
                            if commit_batch_optimized(cursor, batch_data):
                                conn.commit()
                                batch_data.clear()
                                if elements_processed - last_checkpoint_elements >= 1000:
                                    cursor.execute('INSERT OR REPLACE INTO processing_state (key, value) VALUES (?, ?)', 
                                                 ("last_processed_elements", elements_processed))
                                    conn.commit()
                                    last_checkpoint_elements = elements_processed
                            else:
                                batch_data.clear()
                                gc.collect()
                    
                    except Exception as e:
                        if found_records <= 10:
                            log_message("ERROR", f"Ошибка обработки элемента {elements_processed}: {e}")
                            log_message("DEBUG", f"Трассировка: {traceback.format_exc()}")
                    
                    finally:
                        elem.clear()
                        parent = elem.getparent()
                        if parent is not None:
                            while elem.getprevious() is not None:
                                del parent[0]
    
    except Exception as e:
        log_message("ERROR", f"Критическая ошибка парсинга: {e}")
        log_message("DEBUG", f"Трассировка: {traceback.format_exc()}")
        return False
    
    finally:
        if batch_data:
            commit_batch_optimized(cursor, batch_data)
            conn.commit()
        sys.stdout.write("\n")
        log_message("INFO", f"Извлечение завершено. Элементов: {elements_processed}, найдено записей: {found_records}, с кадастровыми номерами: {found_with_cad}, с координатами: {found_with_coords}")

    return True

def process_xml_file(xml_file_path, output_dir):
    base_name = os.path.splitext(os.path.basename(xml_file_path))[0]
    db_path = os.path.join(output_dir, f"{base_name}.sqlite")
    json_path = os.path.join(output_dir, f"{base_name}.json")
    
    log_message("INFO", f"База данных: {db_path}")
    
    try:
        if not os.path.exists(xml_file_path):
            return False, f"XML файл не найден: {xml_file_path}"
        
        total_xml_size = os.path.getsize(xml_file_path)
        log_message("INFO", f"Размер XML: {total_xml_size/1024/1024:.2f} МБ")
        
        conn = setup_database(db_path)
        success = parse_xml_optimized(xml_file_path, conn, total_xml_size)
        
        if not success:
            conn.close()
            return False, "Ошибка на этапе извлечения данных."
        
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM objects')
        total_objects = cursor.fetchone()[0]
        
        if total_objects == 0:
            log_message("INFO", "Объекты не найдены.")
            conn.close()
            if os.path.exists(db_path): os.remove(db_path)
            return False, "Объекты в XML не найдены. Проверьте структуру файла."
        
        cursor.execute('DELETE FROM processing_state WHERE key = "last_processed_elements"')
        conn.commit()
        conn.close()
        
        log_message("INFO", "Начинаем экспорт в JSON...")
        export_db_to_json_optimized(db_path, json_path, os.path.basename(xml_file_path))

        if os.path.exists(db_path):
            os.remove(db_path)
            log_message("INFO", f"Временная база данных {db_path} удалена.")
        
        return True, f"JSON создан: {os.path.basename(json_path)}, объектов: {total_objects}"
    
    except Exception as e:
        log_message("ERROR", f"Критическая ошибка: {e}")
        log_message("DEBUG", f"Трассировка: {traceback.format_exc()}")
        return False, f"Критическая ошибка: {e}"

def export_db_to_json_optimized(db_path, json_path, xml_filename):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) FROM objects')
    total_objects = cursor.fetchone()[0]
    
    log_message("INFO", f"Экспорт {total_objects} объектов в JSON...")
    
    with open(json_path, 'w', encoding='utf-8') as f:
        f.write('{\n')
        f.write(f'  "source_xml_name": {json.dumps(xml_filename)},\n')
        f.write('  "parsing_mode": "memory_optimized_v3",\n')
        f.write('  "objects": [\n')
        
        cursor.execute('SELECT id, type, contours FROM objects')
        is_first = True
        processed = 0
        
        for row in cursor:
            if not is_first: f.write(',\n')
            
            obj_id, obj_type, contours_json = row
            f.write(f'    {{"id":{json.dumps(obj_id)},"type":{json.dumps(obj_type)},"contours":{contours_json}}}')
            
            is_first = False
            processed += 1
            
            if processed % 1000 == 0:
                percent = (processed / total_objects) * 100
                sys.stdout.write(f"\rЭкспорт: {percent:.1f}%")
                sys.stdout.flush()
        
        f.write('\n  ],\n')
        f.write(f'  "total_objects_extracted": {total_objects}\n')
        f.write('}\n')
    
    sys.stdout.write("\n")
    conn.close()
    log_message("INFO", "Экспорт завершен.")

def main():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
    
    print(f"Парсер XML в JSON (v3)")
    print(f"Оптимизация для 8GB RAM: батч={BATCH_SIZE}, лимит={MEMORY_LIMIT_MB}MB")
    
    while True:
        try:
            user_input = input("Введите путь к XML файлу (или 'q' для выхода): ").strip().strip('"')
        except (KeyboardInterrupt, EOFError, OSError):
            print("\nПрограмма завершена.")
            break
        
        if user_input.lower() == 'q': break
        
        if not os.path.isfile(user_input):
            print(f"Файл не найден: {user_input}")
            continue
        
        if user_input.lower().endswith('.xml'):
            success, message = process_xml_file(user_input, OUTPUT_DIR)
            if success: 
                print(f"\nУспех! {message}")
            else: 
                print(f"\nОшибка: {message}")
        else:
            print("Поддерживаются только .xml файлы")

if __name__ == '__main__':
    main()
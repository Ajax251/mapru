import os
import io
import re
import zipfile
import shutil

# Имя целевой папки в директории запуска скрипта
OUTPUT_DIR_NAME = "extracted_kpts"

def extract_kpt_info(xml_bytes):
    """
    Проверяет, является ли файл документом КПТ, и извлекает
    кадастровый номер блока и дату формирования выписки.
    """
    try:
        # Читаем только начало файла для извлечения метаданных
        chunk = xml_bytes[:1024 * 1024]
        header_str = ""
        for encoding in ['utf-8', 'windows-1251', 'cp1251', 'utf-16']:
            try:
                header_str = chunk.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        if not header_str:
            header_str = chunk.decode('utf-8', errors='ignore')
        
        # Проверка корневого тега КПТ
        if not re.search(r'<(?:\w+:)?extract_cadastral_plan_territory\b', header_str):
            return None
            
        # Поиск даты формирования выписки
        date_match = re.search(r'<(?:\w+:)?date_formation\b[^>]*>([^<]+)</(?:\w+:)?date_formation>', header_str)
        date_val = date_match.group(1).strip() if date_match else "0000-00-00"
        
        # Поиск первого кадастрового номера в документе
        cad_match = re.search(r'<(?:\w+:)?cadastral_number\b[^>]*>([^<]+)</(?:\w+:)?cadastral_number>', header_str)
        cad_val = cad_match.group(1).strip() if cad_match else "unknown"
        
        return cad_val, date_val
    except Exception:
        return None

def process_zip_object(z, output_dir, stats):
    """Рекурсивно обрабатывает объект ZipFile."""
    for name in z.namelist():
        if name.endswith('/'): 
            continue
        lower_name = name.lower()
        if lower_name.endswith('.xml'):
            try:
                # Читаем первый 1 МБ для проверки метаданных
                with z.open(name) as f:
                    chunk = f.read(1024 * 1024)
                
                info = extract_kpt_info(chunk)
                if info:
                    cad_num, date_formation = info
                    cad_safe = re.sub(r'[\\/*?:"<>|]', '_', cad_num).strip()
                    date_safe = re.sub(r'[\\/*?:"<>|]', '_', date_formation).strip()
                    
                    dest_filename = f"{cad_safe} {date_safe}.xml"
                    dest_path = os.path.join(output_dir, dest_filename)
                    
                    incoming_size = z.getinfo(name).file_size
                    
                    # Проверка совпадения по размеру
                    if os.path.exists(dest_path):
                        existing_size = os.path.getsize(dest_path)
                        if existing_size == incoming_size:
                            stats['skipped'] += 1
                            continue
                    
                    with z.open(name) as f:
                        content = f.read()
                    with open(dest_path, 'wb') as out_f:
                        out_f.write(content)
                    stats['count'] += 1
                    print(f"  [В архиве] Извлечен: {dest_filename} ({incoming_size} байт)")
            except Exception:
                pass
        elif lower_name.endswith('.zip'):
            try:
                with z.open(name) as nested_z_file:
                    nested_bytes = nested_z_file.read()
                with zipfile.ZipFile(io.BytesIO(nested_bytes)) as nested_z:
                    process_zip_object(nested_z, output_dir, stats)
            except Exception:
                pass

def process_local_file(file_path, output_dir, stats):
    """Обрабатывает отдельный файл на диске (XML или ZIP)."""
    lower_name = file_path.lower()
    if lower_name.endswith('.xml'):
        try:
            with open(file_path, 'rb') as f:
                chunk = f.read(1024 * 1024)
            
            info = extract_kpt_info(chunk)
            if info:
                cad_num, date_formation = info
                cad_safe = re.sub(r'[\\/*?:"<>|]', '_', cad_num).strip()
                date_safe = re.sub(r'[\\/*?:"<>|]', '_', date_formation).strip()
                
                dest_filename = f"{cad_safe} {date_safe}.xml"
                dest_path = os.path.join(output_dir, dest_filename)
                
                incoming_size = os.path.getsize(file_path)
                
                if os.path.exists(dest_path):
                    existing_size = os.path.getsize(dest_path)
                    if existing_size == incoming_size:
                        stats['skipped'] += 1
                        return
                
                shutil.copy2(file_path, dest_path)
                stats['count'] += 1
                print(f"  [На диске] Скопирован: {dest_filename} ({incoming_size} байт)")
        except Exception:
            pass
    elif lower_name.endswith('.zip'):
        try:
            with zipfile.ZipFile(file_path) as z:
                process_zip_object(z, output_dir, stats)
        except Exception:
            pass

def main():
    launch_dir = os.getcwd()
    user_input = input("Укажите путь к папке для сканирования (оставьте пустым для текущей): ").strip()
    scan_dir = os.path.abspath(user_input) if user_input and os.path.isdir(os.path.abspath(user_input)) else launch_dir

    output_dir = os.path.join(launch_dir, OUTPUT_DIR_NAME)
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    print(f"\nНачало сканирования директории: {scan_dir}")
    print(f"Папка для сохранения КПТ: {output_dir}\n")

    stats = {'count': 0, 'skipped': 0}

    for current_root, dirs, files in os.walk(scan_dir):
        # Пропускаем целевую папку сохранения результатов
        if os.path.abspath(current_root) == os.path.abspath(output_dir):
            continue
        
        # Вывод текущей сканируемой папки
        print(f"Сканируется папка: {current_root}")
        
        for file in files:
            file_path = os.path.join(current_root, file)
            process_local_file(file_path, output_dir, stats)

    print("\n--- Обработка завершена ---")
    print(f"Всего сохранено / обновлено файлов: {stats['count']}")
    print(f"Пропущено дубликатов (с совпадающим размером): {stats['skipped']}")

if __name__ == "__main__":
    main()
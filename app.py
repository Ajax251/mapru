import os
import re
import glob
import requests
from urllib.parse import urlparse

# --- НАСТРОЙКИ ---

# 1. Имя папки, куда будут скачиваться и где будут искаться файлы
LOCAL_FOLDER_NAME = "webfonts"

# 2. Расширения файлов, которые мы считаем скачиваемыми ресурсами
TARGET_EXTENSIONS = {'.js', '.css', '.ttf', '.woff2'}

# --- КОНЕЦ НАСТРОЕК ---


def analyze_files():
    """
    Анализирует HTML файлы, находит ссылки на ресурсы, проверяет их наличие
    и составляет план по скачиванию и замене путей.
    """
    print("--- Фаза 1: Анализ файлов ---")
    
    html_files = glob.glob('**/*.html', recursive=True)
    if not html_files:
        print("В текущей папке и подпапках не найдено HTML-файлов.")
        return None, None

    url_pattern = re.compile(r'(src|href)=["\'](https?://[^"\']+)["\']')
    
    replacements_plan = {}
    files_to_download = set()

    for file_path in html_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            print(f"[ПРЕДУПРЕЖДЕНИЕ] Не удалось прочитать файл {file_path}: {e}")
            continue

        for match in url_pattern.finditer(content):
            attr, old_url = match.groups()
            
            # Разбираем URL, чтобы получить путь и расширение файла
            parsed_url = urlparse(old_url)
            file_path_from_url = parsed_url.path
            file_ext = os.path.splitext(file_path_from_url)[1]

            # Обрабатываем только целевые расширения
            if file_ext in TARGET_EXTENSIONS:
                file_name = os.path.basename(file_path_from_url)
                
                # Проверяем, существует ли файл локально
                local_file_path = os.path.join(LOCAL_FOLDER_NAME, file_name)
                if not os.path.exists(local_file_path):
                    files_to_download.add(old_url)
                
                # Добавляем в план замен в любом случае
                new_path = f"/{LOCAL_FOLDER_NAME}/{file_name}"
                if file_path not in replacements_plan:
                    replacements_plan[file_path] = []
                
                full_string_to_replace = match.group(0)
                new_string = f'{attr}="{new_path}"'
                
                if (full_string_to_replace, new_string) not in replacements_plan[file_path]:
                    replacements_plan[file_path].append((full_string_to_replace, new_string))

    return replacements_plan, files_to_download

def download_files(urls_to_download, dest_folder):
    """
    Скачивает файлы из списка в указанную папку.
    """
    print("\n--- Фаза 2: Скачивание недостающих файлов ---")
    if not os.path.exists(dest_folder):
        os.makedirs(dest_folder)
        print(f"Создана папка: '{dest_folder}'")

    download_success = True
    for url in sorted(list(urls_to_download)):
        try:
            file_name = os.path.basename(urlparse(url).path)
            save_path = os.path.join(dest_folder, file_name)
            
            print(f"Скачивание '{url}'...", end='', flush=True)
            response = requests.get(url, timeout=30, stream=True)
            response.raise_for_status() # Проверка на HTTP ошибки (4xx, 5xx)

            with open(save_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            print(" [OK]")

        except requests.exceptions.RequestException as e:
            print(f" [ОШИБКА СКАЧИВАНИЯ]\n   - Ошибка сети: {e}")
            download_success = False
        except Exception as e:
            print(f" [НЕИЗВЕСТНАЯ ОШИБКА]\n   - Ошибка: {e}")
            download_success = False

    if not download_success:
        print("\nВНИМАНИЕ: Некоторые файлы не удалось скачать. Проверьте ошибки выше.")
    
    return download_success


def execute_replacements(plan):
    """
    Выполняет замены в файлах согласно плану.
    """
    print("\n--- Фаза 3: Замена путей в файлах ---")
    total_files_changed = 0
    for file_path, changes in plan.items():
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            original_content = content
            for old_string, new_string in changes:
                content = content.replace(old_string, new_string)

            if content != original_content:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"[OK] Файл '{file_path}' успешно обновлен.")
                total_files_changed += 1
        except Exception as e:
            print(f"[ОШИБКА] Не удалось обновить файл {file_path}: {e}")
            
    print(f"\nЗавершено. Обновлено файлов: {total_files_changed}.")


if __name__ == "__main__":
    plan, files_to_download = analyze_files()

    if plan is None:
        exit()

    if not plan and not files_to_download:
        print("\nАнализ завершен. Не найдено внешних JS/CSS/шрифтов для локализации.")
        exit()
        
    # Показываем план
    if files_to_download:
        print("\n" + "="*50)
        print("!!! НАЙДЕНЫ НЕДОСТАЮЩИЕ ФАЙЛЫ ДЛЯ СКАЧИВАНИЯ !!!")
        print("="*50)
        for url in sorted(list(files_to_download)):
            print(f" - {url}")
    
    if plan:
        print("\n" + "="*50)
        print("!!! ПЛАНИРУЮТСЯ СЛЕДУЮЩИЕ ЗАМЕНЫ ПУТЕЙ !!!")
        print("="*50)
        for file_path, changes in plan.items():
            print(f"\nВ файле '{file_path}':")
            for old, new in changes:
                print(f"  - Заменить '{old}'\n    на      '{new}'")

    print("\n" + "="*50)
    try:
        prompt = "Скачать недостающие файлы и выполнить замены? (y/n): " if files_to_download else "Выполнить замены? (y/n): "
        choice = input(prompt).lower()
    except KeyboardInterrupt:
        print("\nОтмена операции пользователем.")
        exit()

    if choice == 'y':
        download_ok = True
        if files_to_download:
            download_ok = download_files(files_to_download, LOCAL_FOLDER_NAME)
        
        if download_ok:
            execute_replacements(plan)
        else:
            print("\nЗамена путей не была выполнена, так как во время скачивания произошли ошибки.")
    else:
        print("Операция отменена. Файлы не изменены.")
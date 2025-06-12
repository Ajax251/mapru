import os
import re

def find_path_changes_in_file(filepath):
    """
    Анализирует HTML-файл и находит все абсолютные пути, которые нужно исправить.
    Возвращает список строк с описанием изменений для предпросмотра.
    """
    changes_for_preview = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Универсальное регулярное выражение для поиска путей в src, href и url()
        # Ищет: src="/...", href='/...', url(/...), url('/...'), url("/...")
        pattern = re.compile(
            r"""
            \b(src|href)\s*=\s*(["'])\s*/([^/"'#?][^"'?#]*)\2| # Группы 1,2,3: src/href
            url\(\s*(["']?)\s*/([^/"')#?][^"')?#]*)\1\s*\)      # Группы 4,5: url()
            """,
            re.VERBOSE | re.IGNORECASE
        )

        for match in pattern.finditer(content):
            line_number = content.count('\n', 0, match.start()) + 1
            
            if match.group(3):  # Если сработала первая часть (src/href)
                old_path = match.group(3)
                attribute = match.group(1)
                preview_old = f'{attribute}="/{old_path}"'
                preview_new = f'{attribute}="{old_path}"'
            else:  # Если сработала вторая часть (url)
                old_path = match.group(5)
                preview_old = f'url(/{old_path})'
                preview_new = f'url({old_path})'

            changes_for_preview.append(f"    - Строка ~{line_number}: {preview_old}  ->  {preview_new}")

        return changes_for_preview

    except Exception as e:
        print(f"  -> Ошибка при чтении файла {os.path.basename(filepath)}: {e}")
        return []

def apply_changes_to_file(filepath):
    """
    Применяет все исправления к указанному файлу.
    """
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content

        # Такое же регулярное выражение для замены
        pattern = re.compile(
            r"""
            (\b(src|href)\s*=\s*(["']))\s*/([^/"'#?][^"'?#]*)(\3)| # Группы 1,2,3,4,5: src/href
            (url\(\s*(["']?))\s*/([^/"')#?][^"')?#]*)(\7\s*\))      # Группы 6,7,8,9: url()
            """,
            re.VERBOSE | re.IGNORECASE
        )

        def replacer(match):
            if match.group(1): # Если сработала первая часть (src/href)
                # Собираем обратно: `src="` + `путь` + `"`
                return f"{match.group(1)}{match.group(4)}{match.group(5)}"
            elif match.group(6): # Если сработала вторая часть (url)
                # Собираем обратно: `url(` + `путь` + `)`
                return f"{match.group(6)}{match.group(8)}{match.group(9)}"
            return match.group(0) # На всякий случай

        new_content = pattern.sub(replacer, content)

        if new_content != original_content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            return True
        return False

    except Exception as e:
        print(f"  -> Ошибка при записи в файл {filepath}: {e}")
        return False


def main():
    """
    Главная функция для поиска, предпросмотра и применения изменений.
    """
    current_directory = os.getcwd()
    print(f"Поиск HTML-файлов в папке: {current_directory}\n")
    
    html_files = [f for f in os.listdir(current_directory) if f.lower().endswith(('.html', '.htm'))]
    
    if not html_files:
        print("HTML-файлы не найдены в текущей папке.")
        return

    files_with_changes = {}
    total_changes_count = 0

    print("--- Предварительный просмотр изменений ---")
    for filename in html_files:
        filepath = os.path.join(current_directory, filename)
        changes = find_path_changes_in_file(filepath)
        
        if changes:
            files_with_changes[filepath] = changes
            total_changes_count += len(changes)

    if total_changes_count == 0:
        print("\nНикаких изменений не требуется. Все пути уже относительные.")
        return
    
    # Выводим сгруппированные изменения
    for filepath, changes in files_with_changes.items():
        print(f"\n[+] Найдены изменения в файле '{os.path.basename(filepath)}':")
        for change_preview in changes:
            print(change_preview)
        
    print("\n" + "="*40)
    print(f"Всего найдено изменений для исправления: {total_changes_count}")
    print("="*40)

    try:
        user_input = input("\nПрименить эти изменения? (yes/y): ").lower().strip()
    except KeyboardInterrupt:
        print("\nОтмена операции.")
        return
        
    if user_input in ['yes', 'y', 'да', 'д']:
        print("\n--- Применение изменений ---")
        updated_count = 0
        for filepath in files_with_changes.keys():
            print(f"Обновление файла '{os.path.basename(filepath)}'...")
            if apply_changes_to_file(filepath):
                updated_count += 1
        print(f"\nГотово! Обновлено файлов: {updated_count}.")
    else:
        print("\nОперация отменена. Никакие файлы не были изменены.")

if __name__ == "__main__":
    main()
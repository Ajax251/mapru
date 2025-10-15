import xml.etree.ElementTree as ET
import json
import os

def get_xml_structure(element):
    """
    Рекурсивно обходит XML-элемент и создает словарь,
    представляющий его структуру. Оставляет только первый экземпляр
    из группы одинаковых тегов для компактности.
    """
    node_structure = {}

    # Сохраняем атрибуты, если они есть
    if element.attrib:
        node_structure['@attributes'] = element.attrib

    # Группируем дочерние элементы по тегам
    children_by_tag = {}
    for child in element:
        if child.tag not in children_by_tag:
            children_by_tag[child.tag] = []
        children_by_tag[child.tag].append(child)

    # Обрабатываем дочерние элементы
    for tag, children_list in children_by_tag.items():
        # Если тег один, представляем как объект
        if len(children_list) == 1:
            node_structure[tag] = get_xml_structure(children_list[0])
        # Если тегов несколько (список), берем только ПЕРВЫЙ для анализа структуры
        else:
            node_structure[tag] = [get_xml_structure(children_list[0])]
    
    # Если у узла нет дочерних элементов, но есть текст, сохраняем его
    if element.text and element.text.strip() and not children_by_tag:
        # Если в узле нет ничего, кроме текста
        if not node_structure:
            return element.text.strip()
        # Если есть и атрибуты, и текст
        node_structure['#text'] = element.text.strip()

    return node_structure

# Список для хранения найденных различий
differences = []

def compare_structures(etalon_node, generated_node, path=""):
    """
    Рекурсивно сравнивает два словаря (структуры XML) и записывает
    различия в глобальный список `differences`.
    """
    # Прекращаем сравнение, если типы узлов не совпадают (например, один - словарь, другой - текст)
    if type(etalon_node) is not dict or type(generated_node) is not dict:
        if type(etalon_node) != type(generated_node):
            differences.append(f"ТИП ДАННЫХ РАЗЛИЧАЕТСЯ в '{path}':\n  - Эталон: {type(etalon_node).__name__}\n  - Сгенерировано: {type(generated_node).__name__}")
        return

    etalon_keys = list(etalon_node.keys())
    gen_keys = list(generated_node.keys())

    # 1. Проверка на ОТСУТСТВУЮЩИЕ теги в сгенерированном файле
    missing_keys = set(etalon_keys) - set(gen_keys)
    if missing_keys:
        differences.append(f"ОТСУТСТВУЮТ ТЕГИ в '{path}': {', '.join(missing_keys)}")

    # 2. Проверка на ЛИШНИЕ теги в сгенерированном файле
    extra_keys = set(gen_keys) - set(etalon_keys)
    if extra_keys:
        differences.append(f"ЛИШНИЕ ТЕГИ в '{path}': {', '.join(extra_keys)}")

    # 3. Проверка ПОРЯДКА тегов
    # Сравниваем порядок только для общих ключей, чтобы избежать ошибок из-за лишних/отсутствующих
    common_keys_in_order_etalon = [k for k in etalon_keys if k in gen_keys]
    common_keys_in_order_gen = [k for k in gen_keys if k in etalon_keys]
    if common_keys_in_order_etalon != common_keys_in_order_gen:
        differences.append(f"НАРУШЕН ПОРЯДОК ТЕГОВ в '{path}':\n  - Эталонный порядок: {common_keys_in_order_etalon}\n  - Сгенерированный порядок: {common_keys_in_order_gen}")

    # 4. Рекурсивный спуск для сравнения дочерних узлов
    for key in common_keys_in_order_etalon:
        new_path = f"{path} -> {key}"
        etalon_child = etalon_node[key]
        gen_child = generated_node[key]

        # Если один узел - список, а другой нет, это структурная ошибка
        if type(etalon_child) is list and type(gen_child) is not list:
            differences.append(f"НЕСООТВЕТСТВИЕ СТРУКТУРЫ в '{new_path}': В эталоне это список (несколько элементов), а в сгенерированном файле - один элемент.")
            continue
        if type(etalon_child) is not list and type(gen_child) is list:
            differences.append(f"НЕСООТВЕТСТВИЕ СТРУКТУРЫ в '{new_path}': В эталоне это один элемент, а в сгенерированном файле - список.")
            continue

        if type(etalon_child) is list:
            compare_structures(etalon_child[0], gen_child[0], new_path) # Сравниваем структуру первого элемента списка
        elif type(etalon_child) is dict:
            compare_structures(etalon_child, gen_child, new_path)

def analyze_and_compare(etalon_file, generated_file):
    """
    Главная функция для анализа и сравнения двух XML файлов.
    """
    print("-" * 50)
    print(f"Сравнение эталонного файла '{etalon_file}' и сгенерированного '{generated_file}'")
    print("-" * 50)

    for file in [etalon_file, generated_file]:
        if not os.path.exists(file):
            print(f"ОШИБКА: Файл '{file}' не найден. Убедитесь, что он находится в том же каталоге, что и скрипт.")
            return

    try:
        # Парсим оба файла
        etalon_tree = ET.parse(etalon_file)
        generated_tree = ET.parse(generated_file)
        
        # Получаем структуру
        etalon_structure = {etalon_tree.getroot().tag: get_xml_structure(etalon_tree.getroot())}
        generated_structure = {generated_tree.getroot().tag: get_xml_structure(generated_tree.getroot())}
        
        # Запускаем сравнение
        compare_structures(etalon_structure, generated_structure)

        if not differences:
            print("\n✅ Структурных различий не найдено! Файлы идентичны по структуре и порядку тегов.")
        else:
            print(f"\n❌ Найдено различий: {len(differences)}\n")
            for i, diff in enumerate(differences, 1):
                print(f"{i}. {diff}\n")

    except ET.ParseError as e:
        print(f"ОШИБКА ПАРСИНГА XML: Не удалось прочитать один из файлов. Проверьте их корректность. {e}")
    except Exception as e:
        print(f"Произошла непредвиденная ошибка: {e}")


# --- ЗАПУСК АНАЛИЗА ---
etalon_xml_file = "et.xml"
generated_xml_file = "nspd.xml"

analyze_and_compare(etalon_xml_file, generated_xml_file)
import xml.etree.ElementTree as ET
import os

def get_structure(element, indent=""):
    """Рекурсивно собирает структуру XML без значений"""
    result = f"{indent}<{element.tag}>\n"
    
    seen_tags = set()
    for child in element:
        # Прячем дубликаты однотипных объектов, чтобы файл не был огромным
        if child.tag in seen_tags and child.tag in ['land_record', 'build_record', 'construction_record', 'zones_and_territories_record', 'ordinate', 'contour', 'spatial_element']:
            continue
            
        seen_tags.add(child.tag)
        result += get_structure(child, indent + "  ")
        
    result += f"{indent}</{element.tag}>\n"
    return result

print("=== Анализатор структуры XML КПТ ===")
file1 = input("Введите имя идеального файла (например, ideal.xml): ").strip()
file2 = input("Введите имя вашего файла (например, my.xml): ").strip()

if os.path.exists(file1) and os.path.exists(file2):
    print("\nОбработка...")
    
    tree1 = ET.parse(file1)
    with open("structure_ideal.txt", "w", encoding="utf-8") as f:
        f.write(get_structure(tree1.getroot()))
        
    tree2 = ET.parse(file2)
    with open("structure_my.txt", "w", encoding="utf-8") as f:
        f.write(get_structure(tree2.getroot()))
        
    print("ГОТОВО! Структуры сохранены в файлы structure_ideal.txt и structure_my.txt")
else:
    print("\nОШИБКА: Один или оба файла не найдены в этой папке!")

input("\nНажмите Enter для выхода...")
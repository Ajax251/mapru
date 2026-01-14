import fitz  # PyMuPDF
import re

def clean_egrn_pixel_perfect(input_path, output_path):
    doc = fitz.open(input_path)
    print(f"Обработка файла: {input_path}")

    for page in doc:
        # ==========================================
        # 1. КУВИ (СУЖЕНИЕ ПО ВЕРТИКАЛИ)
        # ==========================================
        text = page.get_text("text")
        # Паттерн: № + пробелы + КУВИ + номер
        regex_kuvi = r"№\s*КУВИ-[\d/]+-[\d]+"
        
        matches = re.findall(regex_kuvi, text)
        for match_str in matches:
            quads = page.search_for(match_str)
            for quad in quads:
                # quad - это прямоугольник вокруг текста.
                # Проблема: он слишком высокий и задевает линии.
                # Решение: Сжимаем его.
                
                # quad.y0 - верх. Опускаем его вниз (+) на 1.5 пункта
                new_y0 = quad.y0 + 1.5
                
                # quad.y1 - низ. Поднимаем его вверх (-) на 1.5 пункта
                new_y1 = quad.y1 - 1.5
                
                # Создаем "суженный" прямоугольник. 
                # По ширине (x0, x1) оставляем как есть, чтобы стереть весь текст.
                # По высоте он стал меньше, поэтому не коснется линий таблицы.
                
                # Проверка на случай очень мелкого шрифта (чтобы не схлопнуть в ноль)
                if new_y1 > new_y0:
                    slim_rect = fitz.Rect(quad.x0, new_y0, quad.x1, new_y1)
                    page.add_redact_annot(slim_rect, fill=(1, 1, 1))
                else:
                    # Если шрифт микроскопический, удаляем как есть (редкий случай)
                    page.add_redact_annot(quad, fill=(1, 1, 1))

        # ==========================================
        # 2. ПОЛУЧАТЕЛЬ (Удаление строки + сохранение верхней линии)
        # ==========================================
        label_hits = page.search_for("Получатель выписки")
        
        for label_rect in label_hits:
            # Начинаем стирать ровно от верха букв (+0.5), 
            # чтобы не задеть линию, которая находится НАД буквами.
            start_y = label_rect.y0 + 0.5
            
            # Стираем вниз до конца страницы (или с большим запасом)
            end_y = label_rect.y1 + 100
            
            kill_zone = fitz.Rect(0, start_y, page.rect.width, end_y)
            page.add_redact_annot(kill_zone, fill=(1, 1, 1))

        # Применяем все удаления
        page.apply_redactions()

    doc.save(output_path)
    print(f"Готово! Сохранено в: {output_path}")

# --- ЗАПУСК ---
input_file = "выписка.pdf" 
output_file = "выписка_perfect.pdf"

if __name__ == "__main__":
    try:
        clean_egrn_pixel_perfect(input_file, output_file)
    except Exception as e:
        print(f"Ошибка: {e}")
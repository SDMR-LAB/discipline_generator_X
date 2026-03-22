from flask import Flask, render_template_string, request, jsonify, send_file
import os
from datetime import date, datetime, timedelta
import json
import sys
import sqlite3
from io import BytesIO
from server.db import init_db, recalc_all_streaks as recalc_all_streaks_db, update_streak as update_streak_db

app = Flask(__name__)

# Загружаем HTML-код
# Получаем директорию, где находится app.py
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
HTML_FILE = os.path.join(BASE_DIR, 'report_generator.html')
PLANNER_FILE = os.path.join(BASE_DIR, 'planner.html')

# Проверяем существование файла
if not os.path.exists(HTML_FILE):
    print(f"❌ Файл не найден: {HTML_FILE}")
    print(f"📍 Текущая директория: {BASE_DIR}")
    print(f"📁 Содержимое директории: {os.listdir(BASE_DIR)}")
    sys.exit(1)

# Загружаем HTML-код
with open(HTML_FILE, 'r', encoding='utf-8') as f:
    HTML_TEMPLATE = f.read()

# Загружаем шаблон планировщика (если есть)
PLANNER_TEMPLATE = None
if os.path.exists(PLANNER_FILE):
    with open(PLANNER_FILE, 'r', encoding='utf-8') as f:
        PLANNER_TEMPLATE = f.read()

# Загружаем шаблон страницы мелких задач (если есть)
TASKS_FILE = os.path.join(BASE_DIR, 'tasks.html')
TASKS_TEMPLATE = None
if os.path.exists(TASKS_FILE):
    with open(TASKS_FILE, 'r', encoding='utf-8') as f:
        TASKS_TEMPLATE = f.read()

print(f"✅ HTML файл загружен: {HTML_FILE}")

# Инициализация БД (вынесена в модуль server.db)
init_db()

@app.route('/')
def index():
    """Главная страница с генератором отчетов"""
    return render_template_string(HTML_TEMPLATE)

@app.route('/ideas')
def ideas_page():
    ideas_file = os.path.join(BASE_DIR, 'ideas.html')
    if os.path.exists(ideas_file):
        with open(ideas_file, 'r', encoding='utf-8') as f:
            return render_template_string(f.read())
    return "Ideas page not found", 404

@app.route('/planner')
def planner_page():
    """Отдельная страница планировщика"""
    if PLANNER_TEMPLATE:
        return render_template_string(PLANNER_TEMPLATE)
    return "Planner page not found", 404

@app.route('/tasks')
def tasks_page():
    """Отдельная страница для примитивного планировщика мелких дел"""
    if TASKS_TEMPLATE:
        return render_template_string(TASKS_TEMPLATE)
    return "Tasks page not found", 404

@app.route('/portable_report.html')
def portable_page():
    """Портативная версия генератора отчётов (можно открывать и как файл)"""
    path = os.path.join(BASE_DIR, 'portable_report.html')
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            return render_template_string(f.read())
    return "Portable generator not found", 404

# ============ API для работы с привычками ============

@app.route('/api/habits', methods=['GET'])
def get_habits():
    """Получение списка всех привычек из справочника"""
    try:
        category = request.args.get('category')
        search = request.args.get('search', '')
        
        conn = sqlite3.connect('habits.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        query = "SELECT * FROM habits WHERE is_active = 1"
        params = []
        
        if category:
            query += " AND category = ?"
            params.append(category)
        
        if search:
            query += " AND (name LIKE ? OR description LIKE ?)"
            params.append(f"%{search}%")
            params.append(f"%{search}%")
        
        query += " ORDER BY category, name"
        
        cursor.execute(query, params)
        habits = [dict(row) for row in cursor.fetchall()]
        
        # Загружаем подзадачи для составных привычек
        for habit in habits:
            if habit['is_composite']:
                cursor.execute('SELECT * FROM habit_subtasks WHERE habit_id = ? ORDER BY order_index', (habit['id'],))
                habit['subtasks'] = [dict(row) for row in cursor.fetchall()]
        
        conn.close()
        
        return jsonify({'status': 'success', 'data': habits})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/habits/categories', methods=['GET'])
def get_categories():
    """Получение списка всех категорий"""
    try:
        conn = sqlite3.connect('habits.db')
        cursor = conn.cursor()
        
        cursor.execute('SELECT DISTINCT category FROM habits WHERE is_active = 1 ORDER BY category')
        categories = [row[0] for row in cursor.fetchall()]
        
        conn.close()
        
        return jsonify({'status': 'success', 'data': categories})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/combinations', methods=['GET'])
def get_combinations():
    try:
        conn = sqlite3.connect('habits.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('''
            SELECT c.*, ha.name as name_a, hb.name as name_b
            FROM combinations c
            LEFT JOIN habits ha ON c.habit_a = ha.id
            LEFT JOIN habits hb ON c.habit_b = hb.id
            WHERE c.is_active = 1
            ORDER BY c.id DESC
        ''')
        combos = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return jsonify({'status': 'success', 'data': combos})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/combinations', methods=['POST'])
def create_combination():
    try:
        data = request.json
        a = int(data.get('habit_a'))
        b = int(data.get('habit_b'))
        if a == b:
            return jsonify({'status':'error','message':'habit_a and habit_b must be different'}), 400
        # упорядочим (habit_a < habit_b)
        if a > b:
            a, b = b, a

        conn = sqlite3.connect('habits.db')
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO combinations (name, habit_a, habit_b, i, s, w, e, c, h, st, money, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data.get('name'),
            a, b,
            float(data.get('i', 0.0)),
            float(data.get('s', 0.0)),
            float(data.get('w', 0.0)),
            float(data.get('e', 0.0)),
            float(data.get('c', 0.0)),
            float(data.get('h', 0.0)),
            float(data.get('st', 0.0)),
            float(data.get('money', 0.0)),
            1
        ))
        conn.commit()
        combo_id = cursor.lastrowid
        conn.close()
        return jsonify({'status':'success','id': combo_id})
    except Exception as e:
        return jsonify({'status':'error','message':str(e)}), 500


@app.route('/api/habits', methods=['POST'])
def add_habit():
    """Добавление новой привычки в справочник"""
    try:
        data = request.json
        
        conn = sqlite3.connect('habits.db')
        cursor = conn.cursor()
        
        # Проверяем, существует ли уже такая привычка
        cursor.execute('SELECT id FROM habits WHERE name = ? AND category = ?', 
                      (data['name'], data.get('category', 'Без категории')))
        if cursor.fetchone():
            conn.close()
            return jsonify({'status': 'error', 'message': 'Привычка уже существует'}), 400
        
        # Добавляем привычку
        cursor.execute('''
            INSERT INTO habits 
            (name, category, description, default_quantity, unit, 
             i, s, w, e, c, h, st, money, is_composite)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data['name'],
            data.get('category', 'Без категории'),
            data.get('description'),
            data.get('default_quantity'),
            data.get('unit'),
            data.get('i', 0.0),
            data.get('s', 0.0),
            data.get('w', 0.0),
            data.get('e', 0.0),
            data.get('c', 0.0),
            data.get('h', 0.0),
            data.get('st', 0.0),
            data.get('money', 0.0),
            1 if data.get('is_composite') else 0
        ))
        
        habit_id = cursor.lastrowid
        
        # Если привычка составная, добавляем подзадачи
        if data.get('is_composite') and data.get('subtasks'):
            for i, subtask in enumerate(data['subtasks']):
                cursor.execute('''
                    INSERT INTO habit_subtasks 
                    (habit_id, name, default_quantity, unit, i, s, w, e, c, h, st, money, order_index)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    habit_id,
                    subtask['name'],
                    subtask.get('default_quantity'),
                    subtask.get('unit'),
                    subtask.get('i', 0.0),
                    subtask.get('s', 0.0),
                    subtask.get('w', 0.0),
                    subtask.get('e', 0.0),
                    subtask.get('c', 0.0),
                    subtask.get('h', 0.0),
                    subtask.get('st', 0.0),
                    subtask.get('money', 0.0),
                    i
                ))
        
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success', 'habit_id': habit_id})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/habits/<int:habit_id>', methods=['PUT'])
def update_habit(habit_id):
    """Обновление привычки в справочнике"""
    try:
        data = request.json
        
        conn = sqlite3.connect('habits.db')
        cursor = conn.cursor()
        
        # Обновляем основные данные
        cursor.execute('''
            UPDATE habits SET
                name = COALESCE(?, name),
                category = COALESCE(?, category),
                description = COALESCE(?, description),
                default_quantity = COALESCE(?, default_quantity),
                unit = COALESCE(?, unit),
                i = COALESCE(?, i),
                s = COALESCE(?, s),
                w = COALESCE(?, w),
                e = COALESCE(?, e),
                c = COALESCE(?, c),
                h = COALESCE(?, h),
                st = COALESCE(?, st),
                money = COALESCE(?, money),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (
            data.get('name'),
            data.get('category'),
            data.get('description'),
            data.get('default_quantity'),
            data.get('unit'),
            data.get('i'),
            data.get('s'),
            data.get('w'),
            data.get('e'),
            data.get('c'),
            data.get('h'),
            data.get('st'),
            data.get('money'),
            habit_id
        ))
        
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/habits/<int:habit_id>', methods=['DELETE'])
def delete_habit(habit_id):
    """Удаление привычки из справочника"""
    try:
        conn = sqlite3.connect('habits.db')
        cursor = conn.cursor()
        
        # Мягкое удаление
        cursor.execute('UPDATE habits SET is_active = 0 WHERE id = ?', (habit_id,))
        
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ============ API для работы с идеями ============

@app.route('/api/ideas', methods=['GET'])
def get_ideas():
    """Получить список всех идей (включая выполненные)"""
    try:
        conn = sqlite3.connect('habits.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, filename, title, description, realism, related_ids,
                i, s, w, e, c, h, st, money,
                is_completed, completed_at, created_at, updated_at,
                idea_type, source, problems, what_changes, difficulty
            FROM ideas
            ORDER BY is_completed, updated_at DESC
        ''')
        ideas = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify({'status': 'success', 'data': ideas})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/ideas', methods=['POST'])
def create_idea():
    """Создать новую идею (файл + запись в БД)"""
    try:
        data = request.json
        title = data.get('title', '').strip()
        if not title:
            return jsonify({'status': 'error', 'message': 'Title required'}), 400

        # Генерация имени файла (без даты, просто title.txt)
        import re
        safe_title = re.sub(r'[\\/*?:"<>|]', '', title)  # убираем недопустимые символы
        filename = f"{safe_title}.txt"

        # Путь к папке проекта ideas
        root = os.path.join(BASE_DIR, 'roadmaps', 'ideas')
        os.makedirs(root, exist_ok=True)

        filepath = os.path.join(root, filename)
        if os.path.exists(filepath):
            return jsonify({'status': 'error', 'message': 'Idea with this title already exists'}), 400

        # Создаём пустой файл (описание будет храниться в БД, файл можно оставить для совместимости)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(data.get('description', ''))

        # Вставка в БД
        conn = sqlite3.connect('habits.db')
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO ideas
                (filename, title, description, realism, related_ids,
                i, s, w, e, c, h, st, money,
                idea_type, source, problems, what_changes, difficulty)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            filename,
            title,
            data.get('description', ''),
            data.get('realism', 5),
            json.dumps(data.get('related_ids', [])),
            data.get('i', 0.0),
            data.get('s', 0.0),
            data.get('w', 0.0),
            data.get('e', 0.0),
            data.get('c', 0.0),
            data.get('h', 0.0),
            data.get('st', 0.0),
            data.get('money', 0.0),
            data.get('idea_type', 'own'),
            data.get('source', ''),
            data.get('problems', ''),
            data.get('what_changes', ''),
            data.get('difficulty', 'background')
        ))
        idea_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return jsonify({'status': 'success', 'id': idea_id, 'filename': filename})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/ideas/<int:idea_id>', methods=['PUT'])
def update_idea(idea_id):
    """Обновить существующую идею (БД и, опционально, файл)"""
    try:
        data = request.json
        print('Updating idea with data:', data)   # <-- перенесено внутрь try
        conn = sqlite3.connect('habits.db')
        cursor = conn.cursor()

        # Получаем текущую запись, чтобы знать filename
        cursor.execute('SELECT filename FROM ideas WHERE id = ?', (idea_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return jsonify({'status': 'error', 'message': 'Idea not found'}), 404

        filename = row[0]

        # Обновляем файл, если передано описание
        if 'description' in data:
            root = os.path.join(BASE_DIR, 'roadmaps', 'ideas')
            filepath = os.path.join(root, filename)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(data['description'])

        # Подготавливаем обновление БД
        update_fields = []
        params = []
        for field in ['title', 'description', 'realism', 'i', 's', 'w', 'e', 'c', 'h', 'st', 'money', 
                    'is_completed', 'completed_at', 'idea_type', 'source', 'problems', 'what_changes', 'difficulty']:
            if field in data:
                update_fields.append(f"{field} = ?")
                params.append(data[field])

        if 'related_ids' in data:
            update_fields.append("related_ids = ?")
            params.append(json.dumps(data['related_ids']))

        if not update_fields:
            conn.close()
            return jsonify({'status': 'error', 'message': 'No fields to update'}), 400

        params.append(idea_id)
        cursor.execute(f"UPDATE ideas SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", params)
        conn.commit()
        conn.close()

        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/ideas/<int:idea_id>', methods=['DELETE'])
def delete_idea(idea_id):
    """Удалить идею (файл и запись в БД)"""
    try:
        conn = sqlite3.connect('habits.db')
        cursor = conn.cursor()
        cursor.execute('SELECT filename FROM ideas WHERE id = ?', (idea_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return jsonify({'status': 'error', 'message': 'Idea not found'}), 404

        filename = row[0]

        # Удаляем файл
        root = os.path.join(BASE_DIR, 'roadmaps', 'ideas')
        filepath = os.path.join(root, filename)
        if os.path.exists(filepath):
            os.remove(filepath)

        # Удаляем запись из БД (можно мягко, установив is_active, но здесь жёстко)
        cursor.execute('DELETE FROM ideas WHERE id = ?', (idea_id,))
        conn.commit()
        conn.close()

        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/ideas/<int:idea_id>', methods=['GET'])
def get_idea(idea_id):
    try:
        conn = sqlite3.connect('habits.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, filename, title, description, realism, related_ids,
                   i, s, w, e, c, h, st, money,
                   is_completed, completed_at, created_at, updated_at,
                   idea_type, source, problems, what_changes, difficulty
            FROM ideas WHERE id = ?
        ''', (idea_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return jsonify({'status': 'error', 'message': 'Idea not found'}), 404
        return jsonify({'status': 'success', 'data': dict(row)})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    

@app.route('/api/ideas/<int:idea_id>/complete', methods=['POST'])
def complete_idea(idea_id):
    """Отметить идею выполненной: создать запись в completed_habits и обновить статус"""
    try:
        data = request.json or {}
        deltas = data.get('deltas', {})  # Могут переопределить характеристики

        conn = sqlite3.connect('habits.db')
        cursor = conn.cursor()

        # Получаем данные идеи
        cursor.execute('''
            SELECT id, title, description, i, s, w, e, c, h, st, money
            FROM ideas WHERE id = ?
        ''', (idea_id,))
        
        idea = cursor.fetchone()
        if not idea:
            conn.close()
            return jsonify({'status': 'error', 'message': 'Idea not found'}), 404

        # Дописываем дату выполнения в файл
        root = os.path.join(BASE_DIR, 'roadmaps', 'ideas')
        filepath = os.path.join(root, idea[1])  # idea[1] — filename
        with open(filepath, 'a', encoding='utf-8') as f:
            f.write(f"\n\n---\nВыполнено: {date.today().isoformat()}\n")

        if not idea:
            conn.close()
            return jsonify({'status': 'error', 'message': 'Idea not found'}), 404

        # Характеристики: берём из deltas или из идеи
        def _f(key, default):
            return float(deltas.get(key, default))

        i_val = _f('I', idea[3])
        s_val = _f('S', idea[4])
        w_val = _f('W', idea[5])
        e_val = _f('E', idea[6])
        c_val = _f('C', idea[7])
        h_val = _f('H', idea[8])
        st_val = _f('ST', idea[9])
        money_val = _f('$', idea[10])

        # Создаём или получаем привычку для этой идеи
        habit_name = f"Идея: {idea[2]}"  # title
        category = "Идеи"

        cursor.execute('SELECT id FROM habits WHERE name = ? AND category = ?', (habit_name, category))
        row = cursor.fetchone()
        if row:
            habit_id = row[0]
        else:
            cursor.execute('''
                INSERT INTO habits (name, category, description, i, s, w, e, c, h, st, money, is_composite, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (habit_name, category, idea[2] or '', i_val, s_val, w_val, e_val, c_val, h_val, st_val, money_val, 0, 1))
            habit_id = cursor.lastrowid

        today = date.today().isoformat()

        # Вставляем запись в completed_habits
        cursor.execute('''
            INSERT INTO completed_habits
                (habit_id, date, quantity, success, i, s, w, e, c, h, st, money, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            habit_id,
            today,
            1,  # quantity
            1,  # success
            i_val, s_val, w_val, e_val, c_val, h_val, st_val, money_val,
            f"Идея #{idea_id}"
        ))

        # Обновляем discipline_days
        cursor.execute('SELECT id FROM discipline_days WHERE date = ?', (today,))
        if not cursor.fetchone():
            cursor.execute('INSERT INTO discipline_days (date, day_number, state, completed_count, total_count) VALUES (?, ?, ?, ?, ?)',
                           (today, 1, None, 1, 0))
        else:
            cursor.execute('UPDATE discipline_days SET completed_count = COALESCE(completed_count,0) + 1 WHERE date = ?', (today,))

        # Обновляем статус идеи
        cursor.execute('UPDATE ideas SET is_completed = 1, completed_at = ? WHERE id = ?', (today, idea_id))

        conn.commit()
        conn.close()

        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/ideas/related', methods=['GET'])
def get_related_ideas():
    """Список идей для выпадающего списка связей (id, title)"""
    try:
        conn = sqlite3.connect('habits.db')
        cursor = conn.cursor()
        cursor.execute('SELECT id, title FROM ideas ORDER BY title')
        ideas = [{'id': row[0], 'title': row[1]} for row in cursor.fetchall()]
        conn.close()
        return jsonify({'status': 'success', 'data': ideas})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ============ API для работы с выполненными привычками ============

def update_streak(habit_id, date_str, success):
    """Обновление/создание стрика для привычки"""
    # Перенаправляем вызов в реализацию в server.db
    try:
        update_streak_db(habit_id, date_str, success)
    except Exception as e:
        print(f"Error forwarding update_streak: {e}")

@app.route('/api/completions', methods=['POST'])
def save_completions():
    """Сохранение выполненных привычек за день (и пересчёт стриков)
       + применение индекса трения (friction_index 1..10 -> множитель 1..3)
    """
    try:
        data = request.json
        day_date = data.get('date', date.today().isoformat())

        # --- НОВОЕ: читаем индекс трения и вычисляем множитель (переиграли, теперь максимально х2) ---
        try:
            friction = int(data.get('friction_index', 1) or 1)
        except Exception:
            friction = 1
        # Ограничим 1..10
        friction = max(1, min(10, friction))
        # Линейная шкала: 1 -> 1.0, 10 -> 2.0 (нерфим мультипликатор)
        multiplier = 1.0 + (friction - 1) * (1.0 / 9.0)

        conn = sqlite3.connect('habits.db')
        cursor = conn.cursor()

        # Удаляем старые записи за этот день
        cursor.execute('DELETE FROM completed_habits WHERE date = ?', (day_date,))

        # Сохраняем каждую привычку (только если есть habit_id)
        for habit in data.get('habits', []):
            if not habit.get('habit_id'):
                print('Skipping habit without habit_id:', habit)
                continue

            # характеристики сохраняем как пришли (умножение к общей сумме применим ниже)
            def _r(v):
                try:
                    return float(v or 0.0)
                except Exception:
                    return 0.0

            i_val = _r(habit.get('i', 0.0))
            s_val = _r(habit.get('s', 0.0))
            w_val = _r(habit.get('w', 0.0))
            e_val = _r(habit.get('e', 0.0))
            c_val = _r(habit.get('c', 0.0))
            h_val = _r(habit.get('h', 0.0))
            st_val = _r(habit.get('st', 0.0))
            money_val = _r(habit.get('money', 0.0))

            cursor.execute('''
                INSERT INTO completed_habits 
                (habit_id, date, quantity, success, i, s, w, e, c, h, st, money, 
                 day_number, state, emotion_morning, thoughts)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                habit.get('habit_id'),
                day_date,
                habit.get('quantity'),
                1 if habit.get('success') else 0,
                i_val,
                s_val,
                w_val,
                e_val,
                c_val,
                h_val,
                st_val,
                money_val,
                data.get('day_number'),
                data.get('state'),
                data.get('emotion_morning'),
                data.get('thoughts')
            ))

        # ---- вычислить и применить бонусы сочетаний ----
        try:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('SELECT DISTINCT habit_id FROM completed_habits WHERE date = ? AND success = 1', (day_date,))
            done_ids = set([r['habit_id'] for r in cursor.fetchall()])

            if done_ids:
                cursor.execute('SELECT * FROM combinations WHERE is_active = 1')
                combos = [dict(r) for r in cursor.fetchall()]
                combo_bonus = {'I':0.0,'S':0.0,'W':0.0,'E':0.0,'C':0.0,'H':0.0,'ST':0.0,'$':0.0}
                for c in combos:
                    if c['habit_a'] in done_ids and c['habit_b'] in done_ids:
                        combo_bonus['I'] += c.get('i', 0.0) or 0.0
                        combo_bonus['S'] += c.get('s', 0.0) or 0.0
                        combo_bonus['W'] += c.get('w', 0.0) or 0.0
                        combo_bonus['E'] += c.get('e', 0.0) or 0.0
                        combo_bonus['C'] += c.get('c', 0.0) or 0.0
                        combo_bonus['H'] += c.get('h', 0.0) or 0.0
                        combo_bonus['ST'] += c.get('st', 0.0) or 0.0
                        combo_bonus['$'] += c.get('money', 0.0) or 0.0

                totals = data.get('totals', {}) or {}
                totals = {
                    'I': totals.get('I', 0.0) + combo_bonus['I'],
                    'S': totals.get('S', 0.0) + combo_bonus['S'],
                    'W': totals.get('W', 0.0) + combo_bonus['W'],
                    'E': totals.get('E', 0.0) + combo_bonus['E'],
                    'C': totals.get('C', 0.0) + combo_bonus['C'],
                    'H': totals.get('H', 0.0) + combo_bonus['H'],
                    'ST': totals.get('ST', 0.0) + combo_bonus['ST'],
                    '$': totals.get('$', 0.0) + combo_bonus['$']
                }
                data['totals'] = totals
        except Exception as e:
            print('Error applying combinations bonuses:', e)

        # Сохраняем статистику дня (и приводим к числам)
        totals = data.get('totals', {}) or {}
        for _k in ('I','S','W','E','C','H','ST','$'):
            try:
                totals[_k] = float(totals.get(_k, 0) or 0.0)
            except Exception:
                totals[_k] = 0.0

        # ---- НОВОЕ: применить множитель трения к итоговым показателям дня ----
        for _k in ('I','S','W','E','C','H','ST','$'):
            totals[_k] = totals.get(_k, 0.0) * multiplier

        # ---- вставка discipline_days (как раньше) ----
        conn.row_factory = None
        cursor = conn.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO discipline_days 
            (date, day_number, state, emotion_morning, thoughts,
             total_i, total_s, total_w, total_e, total_c, total_h, total_st, total_money,
             completed_count, total_count, friction_index)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            day_date,
            data.get('day_number'),
            data.get('state'),
            data.get('emotion_morning'),
            data.get('thoughts'),
            totals.get('I', 0.0),
            totals.get('S', 0.0),
            totals.get('W', 0.0),
            totals.get('E', 0.0),
            totals.get('C', 0.0),
            totals.get('H', 0.0),
            totals.get('ST', 0.0),
            totals.get('$', 0.0),
            data.get('completed_count', 0),
            data.get('total_count', 0),
            friction
        ))

        conn.commit()

        recalc_all_streaks(conn)

        conn.close()

        # Можно вернуть multiplier обратно клиенту для отладки/отображения
        return jsonify({'status': 'success', 'friction_index': friction, 'multiplier': multiplier})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/completions/<date>', methods=['GET'])
def get_completions(date):
    """Получение выполненных привычек за день"""
    try:
        conn = sqlite3.connect('habits.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Получаем привычки за день
        cursor.execute('''
            SELECT ch.*, h.name as habit_name, h.category, h.is_composite
            FROM completed_habits ch
            JOIN habits h ON ch.habit_id = h.id
            WHERE ch.date = ?
            ORDER BY h.category, h.name
        ''', (date,))
        
        habits = [dict(row) for row in cursor.fetchall()]
        
        # Получаем статистику дня
        cursor.execute('SELECT * FROM discipline_days WHERE date = ?', (date,))
        day_data = cursor.fetchone()
        
        # Получаем информацию о стриках
        streaks = {}
        for habit in habits:
            cursor.execute('SELECT current_streak, longest_streak FROM streaks WHERE habit_id = ?', 
                          (habit['habit_id'],))
            streak_data = cursor.fetchone()
            if streak_data:
                streaks[habit['habit_id']] = {
                    'current': streak_data[0],
                    'longest': streak_data[1]
                }
        
        conn.close()
        
        # Prepare day data and include multiplier for client convenience
        day_json = dict(day_data) if day_data else None
        if day_json is not None:
            fi = int(day_json.get('friction_index') or 1)
            day_json['friction_index'] = fi
            day_json['friction_multiplier'] = 1.0 + (fi - 1) * (1.0 / 9.0)
        return jsonify({
            'status': 'success',
            'habits': habits,
            'day_data': day_json,
            'streaks': streaks
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/completions/change_date', methods=['POST'])
def change_completion_date():
    """Перенести день из old_date в new_date (копировать + удалять старую запись)."""
    try:
        data = request.json or {}
        old = data.get('old_date')
        new = data.get('new_date')
        if not old or not new:
            return jsonify({'status':'error','message':'old_date and new_date required'}), 400

        conn = sqlite3.connect('habits.db')
        cursor = conn.cursor()

        # Если в целевую дату уже есть записи, удалим их (перезапись)
        cursor.execute('DELETE FROM completed_habits WHERE date = ?', (new,))
        cursor.execute('DELETE FROM discipline_days WHERE date = ?', (new,))

        # Копируем completed_habits
        cursor.execute('SELECT habit_id, subtask_id, quantity, success, i, s, w, e, c, h, st, money, notes, day_number, state, emotion_morning, thoughts FROM completed_habits WHERE date = ?', (old,))
        rows = cursor.fetchall()
        for r in rows:
            cursor.execute('''
                INSERT INTO completed_habits (habit_id, subtask_id, date, quantity, success, i, s, w, e, c, h, st, money, notes, day_number, state, emotion_morning, thoughts)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                r[0], r[1], new, r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], r[11], r[12], r[13], r[14], r[15], r[16]
            ))

        # Копируем discipline_days (если есть)
        cursor.execute('SELECT day_number, state, emotion_morning, thoughts, total_i, total_s, total_w, total_e, total_c, total_h, total_st, total_money, completed_count, total_count FROM discipline_days WHERE date = ?', (old,))
        day = cursor.fetchone()
        if day:
            cursor.execute('''
                INSERT OR REPLACE INTO discipline_days (date, day_number, state, emotion_morning, thoughts, total_i, total_s, total_w, total_e, total_c, total_h, total_st, total_money, completed_count, total_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (new, day[0], day[1], day[2], day[3], day[4], day[5], day[6], day[7], day[8], day[9], day[10], day[11], day[12], day[13]))

        # После успешного копирования — удалим старые записи
        cursor.execute('DELETE FROM completed_habits WHERE date = ?', (old,))
        cursor.execute('DELETE FROM discipline_days WHERE date = ?', (old,))

        conn.commit()
        conn.close()
        return jsonify({'status':'success'})
    except Exception as e:
        return jsonify({'status':'error','message':str(e)}), 500

# ============ API для статистики ============

@app.route('/api/stats/period', methods=['GET'])
def get_period_stats():
    """Получение статистики за период"""
    try:
        period = request.args.get('period', 'week')  # week, month, all
        end_date = date.today()
        
        conn = sqlite3.connect('habits.db')
        cursor = conn.cursor()
        
        if period == 'week':
            start_date = end_date - timedelta(days=7)
        elif period == 'month':
            start_date = end_date - timedelta(days=30)
        else:  # all
            cursor.execute('SELECT MIN(date) FROM discipline_days')
            min_date = cursor.fetchone()[0]
            start_date = datetime.strptime(min_date, '%Y-%m-%d').date() if min_date else end_date
        
        # Явные суммы и средние — чтобы фронт имел predictable ключи (sum_* и avg_*)
        cursor.execute('''
            SELECT 
                COUNT(DISTINCT date) as days_count,
                SUM(total_i) as sum_i,
                SUM(total_s) as sum_s,
                SUM(total_w) as sum_w,
                SUM(total_e) as sum_e,
                SUM(total_c) as sum_c,
                SUM(total_h) as sum_h,
                SUM(total_st) as sum_st,
                SUM(total_money) as sum_money,
                AVG(total_i) as avg_i,
                AVG(total_s) as avg_s,
                AVG(total_w) as avg_w,
                AVG(total_e) as avg_e,
                AVG(total_c) as avg_c,
                AVG(total_h) as avg_h,
                AVG(total_st) as avg_st,
                AVG(total_money) as avg_money
            FROM discipline_days
            WHERE date BETWEEN ? AND ?
        ''', (start_date.isoformat(), end_date.isoformat()))

        row = cursor.fetchone() or (0,)+ (0,)*15  # безопасная подстраховка
        # row -> tuple in order of select
        cols = [c[0] for c in cursor.description]
        raw = dict(zip(cols, row))

        # нормализуем числа: None -> 0, строки -> float
        def _num(x):
            try:
                return float(x) if x is not None else 0.0
            except Exception:
                return 0.0

        stats = {
            'days_count': int(raw.get('days_count') or 0),
            'sum_i': _num(raw.get('sum_i')),
            'sum_s': _num(raw.get('sum_s')),
            'sum_w': _num(raw.get('sum_w')),
            'sum_e': _num(raw.get('sum_e')),
            'sum_c': _num(raw.get('sum_c')),
            'sum_h': _num(raw.get('sum_h')),
            'sum_st': _num(raw.get('sum_st')),
            'sum_money': _num(raw.get('sum_money')),
            'avg_i': _num(raw.get('avg_i')),
            'avg_s': _num(raw.get('avg_s')),
            'avg_w': _num(raw.get('avg_w')),
            'avg_e': _num(raw.get('avg_e')),
            'avg_c': _num(raw.get('avg_c')),
            'avg_h': _num(raw.get('avg_h')),
            'avg_st': _num(raw.get('avg_st')),
            'avg_money': _num(raw.get('avg_money')),
        }

        
        # Статистика по дням для графика
        cursor.execute('''
            SELECT date, total_i, total_s, total_w, total_e, total_c, total_h
            FROM discipline_days 
            WHERE date BETWEEN ? AND ?
            ORDER BY date
        ''', (start_date.isoformat(), end_date.isoformat()))
        
        days_data = []
        for row in cursor.fetchall():
            days_data.append({
                'date': row[0],
                'I': row[1] or 0,
                'S': row[2] or 0,
                'W': row[3] or 0,
                'E': row[4] or 0,
                'C': row[5] or 0,
                'H': row[6] or 0
            })
        
        # Сравнение с предыдущим периодом
        if period == 'week':
            prev_start = start_date - timedelta(days=7)
            prev_end = start_date - timedelta(days=1)
        elif period == 'month':
            prev_start = start_date - timedelta(days=30)
            prev_end = start_date - timedelta(days=1)
        else:
            prev_start = start_date
            prev_end = end_date
        
        cursor.execute('''
            SELECT 
                AVG(total_i) as avg_i,
                AVG(total_s) as avg_s,
                AVG(total_w) as avg_w,
                AVG(total_e) as avg_e,
                AVG(total_c) as avg_c,
                AVG(total_h) as avg_h
            FROM discipline_days 
            WHERE date BETWEEN ? AND ?
        ''', (prev_start.isoformat(), prev_end.isoformat()))
        
        prev_stats = cursor.fetchone()
        
        comparison = {}
        if prev_stats:
            current_avgs = [stats['avg_i'], stats['avg_s'], stats['avg_w'], 
                           stats['avg_e'], stats['avg_c'], stats['avg_h']]
            prev_avgs = [prev_stats[0] or 0, prev_stats[1] or 0, prev_stats[2] or 0,
                        prev_stats[3] or 0, prev_stats[4] or 0, prev_stats[5] or 0]
            
            for i, stat_name in enumerate(['I', 'S', 'W', 'E', 'C', 'H']):
                current = current_avgs[i]
                previous = prev_avgs[i]
                if previous == 0:
                    comparison[stat_name] = '→'
                else:
                    change = ((current - previous) / abs(previous)) * 100
                    if change > 5:
                        comparison[stat_name] = '↑'
                    elif change < -5:
                        comparison[stat_name] = '↓'
                    else:
                        comparison[stat_name] = '→'
        
        conn.close()
        
        return jsonify({
            'status': 'success',
            'period': period,
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'stats': stats,
            'days_data': days_data,
            'comparison': comparison
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

def recalc_all_streaks(conn=None):
    """Обёртка: делегирует пересчёт стриков в server.db.recalc_all_streaks.

    Поддерживает старый вызов с передачей соединения (`conn`), но внутренняя
    реализация создаёт своё соединение к файлу `habits.db`.
    """
    try:
        recalc_all_streaks_db()
    except Exception as e:
        print(f"Error recalculating streaks: {e}")


@app.route('/api/stats/streaks', methods=['GET'])
def get_streaks():
    """Получение стриков привычек (включая нулевые)"""
    try:
        conn = sqlite3.connect('habits.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('''
            SELECT 
                h.id as habit_id,
                h.name,
                h.category,
                COALESCE(s.current_streak, 0) as current_streak,
                COALESCE(s.longest_streak, 0) as longest_streak,
                s.last_date
            FROM habits h
            LEFT JOIN streaks s ON h.id = s.habit_id
            WHERE h.is_active = 1
            ORDER BY current_streak DESC, longest_streak DESC, h.category, h.name
        ''')

        streaks = [dict(row) for row in cursor.fetchall()]

        conn.close()

        return jsonify({'status': 'success', 'data': streaks})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/stats/total_days', methods=['GET'])
def get_total_days():
    """Получение общего количества дней дисциплины"""
    try:
        conn = sqlite3.connect('habits.db')
        cursor = conn.cursor()
        
        cursor.execute('SELECT COUNT(DISTINCT date) FROM discipline_days')
        total_days = cursor.fetchone()[0] or 0
        
        cursor.execute('SELECT MAX(day_number) FROM discipline_days')
        max_day = cursor.fetchone()[0] or 0
        
        conn.close()
        
        return jsonify({
            'status': 'success',
            'total_days': total_days,
            'max_day': max_day
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/stats/daily_comparison', methods=['GET'])
def get_daily_comparison():
    """Сравнение характеристик с предыдущим днем"""
    try:
        target_date = request.args.get('date', date.today().isoformat())
        
        conn = sqlite3.connect('habits.db')
        cursor = conn.cursor()
        
        # Получаем статистику за целевой день
        cursor.execute('''
            SELECT total_i, total_s, total_w, total_e, total_c, total_h, total_st, total_money
            FROM discipline_days WHERE date = ?
        ''', (target_date,))
        
        today_stats = cursor.fetchone()
        
        if not today_stats:
            return jsonify({'status': 'success', 'comparison': {}})
        
        # Получаем предыдущий день с данными
        cursor.execute('''
            SELECT date, total_i, total_s, total_w, total_e, total_c, total_h, total_st, total_money
            FROM discipline_days 
            WHERE date < ? 
            ORDER BY date DESC 
            LIMIT 1
        ''', (target_date,))
        
        prev_day = cursor.fetchone()
        
        comparison = {}
        if prev_day:
            stat_names = ['I', 'S', 'W', 'E', 'C', 'H', 'ST', '$']
            today_values = today_stats
            prev_values = prev_day[1:]
            
            for i, stat in enumerate(stat_names):
                today_val = today_values[i] or 0
                prev_val = prev_values[i] or 0
                
                if prev_val == 0:
                    if today_val > 0:
                        comparison[stat] = '↑'
                    elif today_val < 0:
                        comparison[stat] = '↓'
                    else:
                        comparison[stat] = '→'
                else:
                    change = ((today_val - prev_val) / abs(prev_val)) * 100
                    if change > 5:
                        comparison[stat] = '↑'
                    elif change < -5:
                        comparison[stat] = '↓'
                    else:
                        comparison[stat] = '→'
        
        conn.close()
        
        return jsonify({
            'status': 'success',
            'comparison': comparison,
            'prev_date': prev_day[0] if prev_day else None
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ============ API для работы с файлами ============

@app.route('/api/save', methods=['POST'])
def save_data():
    """Сохранение данных в файл (для обратной совместимости)"""
    try:
        data = request.json
        
        if not os.path.exists('data'):
            os.makedirs('data')
        
        filename = f"data/report_{date.today().isoformat()}.json"
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        return jsonify({
            'status': 'success', 
            'message': f'Данные сохранены в {filename}',
            'file': filename
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/export', methods=['POST'])
def export_data():
    """Экспорт данных в формате TXT или CSV"""
    try:
        data = request.json
        content = data.get('content', '')
        format_type = data.get('format', 'txt')
        
        if format_type == 'csv':
            return jsonify({
                'status': 'success',
                'content': content,
                'filename': f'report_{date.today()}.csv'
            })
        else:
            return jsonify({
                'status': 'success',
                'content': content,
                'filename': f'report_{date.today()}.txt'
            })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# ============ Дополнительные эндпоинты ============

@app.route('/api/health', methods=['GET'])
def health_check():
    """Проверка работоспособности сервера и БД"""
    try:
        conn = sqlite3.connect('habits.db')
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM habits')
        habits_count = cursor.fetchone()[0]
        conn.close()
        
        return jsonify({
            'status': 'healthy',
            'database': 'connected',
            'habits_count': habits_count,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({'status': 'unhealthy', 'error': str(e)}), 500


@app.route('/api/planner/projects', methods=['GET'])
def planner_projects():
    """Список проектов (папок) в директории roadmaps/"""
    try:
        root = os.path.join(BASE_DIR, 'roadmaps')
        if not os.path.exists(root):
            os.makedirs(root)

        projects = []
        for name in sorted(os.listdir(root)):
            p = os.path.join(root, name)
            if os.path.isdir(p):
                projects.append(name)

        print("Projects found:", projects) 
        return jsonify({'status': 'success', 'data': projects})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/planner/project/<project_name>', methods=['GET'])
def planner_project(project_name):
    """Список задач в проекте и их содержимое"""
    try:
        root = os.path.join(BASE_DIR, 'roadmaps')
        proj_path = os.path.normpath(os.path.join(root, project_name))
        if not proj_path.startswith(os.path.normpath(root)) or not os.path.exists(proj_path):
            return jsonify({'status': 'error', 'message': 'Project not found'}), 404

        items = []
        for fn in sorted(os.listdir(proj_path)):
            fp = os.path.join(proj_path, fn)
            if os.path.isfile(fp):
                try:
                    with open(fp, 'r', encoding='utf-8') as f:
                        content = f.read()
                except Exception:
                    content = ''
                completed = 'выполнено' in fn.lower() or 'вypol' in fn.lower()
                items.append({'filename': fn, 'content': content, 'completed': completed})

        return jsonify({'status': 'success', 'data': items})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/planner/create_project', methods=['POST'])
def planner_create_project():
    try:
        data = request.json or {}
        name = data.get('name')
        if not name:
            return jsonify({'status':'error','message':'name required'}), 400
        root = os.path.join(BASE_DIR, 'roadmaps')
        proj = os.path.normpath(os.path.join(root, name))
        if not proj.startswith(os.path.normpath(root)):
            return jsonify({'status':'error','message':'invalid name'}), 400
        os.makedirs(proj, exist_ok=True)
        return jsonify({'status':'success'})
    except Exception as e:
        return jsonify({'status':'error','message':str(e)}), 500


@app.route('/api/planner/toggle_training', methods=['POST'])
def planner_toggle_training():
    """Поставить/снять флаг обучающего проекта: добавляет/убирает префикс '!' у папки"""
    try:
        data = request.json or {}
        project = data.get('project')
        if not project:
            return jsonify({'status':'error','message':'project required'}), 400

        root = os.path.join(BASE_DIR, 'roadmaps')
        src = os.path.normpath(os.path.join(root, project))
        if not src.startswith(os.path.normpath(root)) or not os.path.exists(src):
            return jsonify({'status':'error','message':'project not found'}), 404

        # compute new name
        basename = os.path.basename(src)
        if basename.startswith('!'):
            new_basename = basename[1:]
        else:
            new_basename = '!' + basename

        dst = os.path.normpath(os.path.join(root, new_basename))
        if os.path.exists(dst):
            return jsonify({'status':'error','message':'target name exists'}), 400

        os.replace(src, dst)
        return jsonify({'status':'success','new_name': new_basename})
    except Exception as e:
        return jsonify({'status':'error','message':str(e)}), 500


@app.route('/api/planner/task', methods=['POST', 'PUT', 'DELETE'])
def planner_task():
    try:
        data = request.json or {}
        project = data.get('project')
        filename = data.get('filename')
        if not project or not filename:
            return jsonify({'status':'error','message':'project and filename required'}), 400

        root = os.path.join(BASE_DIR, 'roadmaps')
        proj_path = os.path.normpath(os.path.join(root, project))
        if not proj_path.startswith(os.path.normpath(root)) or not os.path.exists(proj_path):
            return jsonify({'status':'error','message':'project not found'}), 404

        fp = os.path.normpath(os.path.join(proj_path, filename))
        if not fp.startswith(proj_path):
            return jsonify({'status':'error','message':'invalid filename'}), 400

        if request.method == 'POST':
            # create new file (fail if exists)
            # Для обучающих проектов: если в названии нет даты, добавим текущую дату
            try:
                is_training = project.startswith('!')
            except Exception:
                is_training = False

            if is_training:
                import re
                if not re.search(r"\d{4}-\d{2}-\d{2}", filename):
                    name, ext = os.path.splitext(filename)
                    filename = f"{name} {date.today().isoformat()}{ext}"
                    fp = os.path.normpath(os.path.join(proj_path, filename))

            if os.path.exists(fp):
                return jsonify({'status':'error','message':'file exists'}), 400
            content = data.get('content','') or ''
            with open(fp, 'w', encoding='utf-8') as f:
                f.write(content)
            return jsonify({'status':'success', 'filename': filename})

        if request.method == 'PUT':
            # update content (must exist)
            # Сохраняем информацию о повторе если она есть
            if os.path.exists(fp):
                with open(fp, 'r', encoding='utf-8') as f:
                    old_content = f.read()
                
                # Извлекаем информацию о повторе если она есть
                repeat_header = ''
                if old_content.startswith('════'):
                    lines = old_content.split('\n')
                    if len(lines) >= 3 and lines[0].startswith('════'):
                        repeat_header = '\n'.join(lines[:3]) + '\n\n'
            else:
                repeat_header = ''
            
            new_content = data.get('content','') or ''
            # Присоединяем информацию о повторе к новому содержимому
            final_content = repeat_header + new_content
            with open(fp, 'w', encoding='utf-8') as f:
                f.write(final_content)
            return jsonify({'status':'success'})

        if request.method == 'DELETE':
            if os.path.exists(fp):
                os.remove(fp)
                return jsonify({'status':'success'})
            return jsonify({'status':'error','message':'file not found'}), 404

    except Exception as e:
        return jsonify({'status':'error','message':str(e)}), 500


def calculate_ebbinghaus_next_date(x_count):
    """
    Рассчитывает дату следующего повторения по кривой Эббингауза.
    Кривая Эббингауза предполагает интервалы повторения:
    - 1-е повторение: 1 день
    - 2-е повторение: 3 дня
    - 3-е повторение: 7 дней
    - 4-е повторение: 14 дней
    - 5-е повторение: 30 дней
    Args:
        x_count: количество x'ов (повторений)
    Returns:
        дата в формате YYYY-MM-DD
    """
    intervals = {
        0: 0,    # свежее (не повторяли)
        1: 1,    # 1 день
        2: 3,    # 3 дня
        3: 7,    # 7 дней
        4: 14,   # 14 дней
        5: 30,   # 30 дней
    }
    
    # после 5-го повторения используем 30 дней
    days_interval = intervals.get(x_count, 30)
    next_date = date.today() + timedelta(days=days_interval)
    return next_date.isoformat()


@app.route('/api/planner/complete', methods=['POST'])
def planner_mark_complete():
    """Отметить задачу выполненной/отменить отметку — переименовывает файл"""
    try:
        data = request.json or {}
        project = data.get('project')
        filename = data.get('filename')
        mark = bool(data.get('mark', True))

        if not project or not filename:
            return jsonify({'status': 'error', 'message': 'project and filename required'}), 400

        root = os.path.join(BASE_DIR, 'roadmaps')
        proj_path = os.path.normpath(os.path.join(root, project))
        if not proj_path.startswith(os.path.normpath(root)) or not os.path.exists(proj_path):
            return jsonify({'status': 'error', 'message': 'Project not found'}), 404

        src = os.path.join(proj_path, filename)
        if not os.path.exists(src) or not os.path.isfile(src):
            return jsonify({'status': 'error', 'message': 'File not found'}), 404

        name, ext = os.path.splitext(filename)
        done_suffix = ' выполнено'

        try:
            is_training = project.startswith('!')
        except Exception:
            is_training = False

        if is_training:
            # Ebbinghaus behavior: append one 'x' per completion; after 3 x -> mark done
            # Also set/update the date of last completion in the filename when marking.
            base = name
            # remove existing done suffix if present
            if base.endswith(done_suffix):
                base = base[:-len(done_suffix)]

            import re
            # parse: core name, optional date YYYY-MM-DD, optional xs
            m = re.match(r"^(.*?)(?:\s(\d{4}-\d{2}-\d{2}))?(?:\s([x]+))?$", base)
            if m:
                core = (m.group(1) or '').strip()
                date_part = m.group(2)
                xs = m.group(3) or ''
                x_count = len(xs)
            else:
                core = base.strip()
                date_part = None
                x_count = 0

            today_str = date.today().isoformat()

            if mark:
                # increment repetitions (cap at 3) and update last-date to today
                x_count = min(3, x_count + 1)
                date_part = today_str
            else:
                # unmark: if was done (had done_suffix) - remove done flag but keep 3 x
                if name.endswith(done_suffix):
                    x_count = 3
                elif x_count > 0:
                    x_count = max(0, x_count - 1)
                # if no more repetitions, clear date
                if x_count == 0:
                    date_part = None

            # build new name
            parts = [core]
            if date_part:
                parts.append(date_part)
            
            if x_count > 0:
                parts.append('x' * x_count)

            new_name_body = ' '.join(parts).strip()
            if x_count >= 3:
                new_name = new_name_body + done_suffix + ext
            else:
                new_name = new_name_body + ext

            # Читаем текущее содержимое файла
            with open(src, 'r', encoding='utf-8') as f:
                current_content = f.read()
            
            # Удаляем старую информацию о повторе если она есть (она начинается с ════)
            lines = current_content.split('\n')
            if lines and lines[0].startswith('════'):
                # удаляем заголовок и пустую строку после него
                if len(lines) > 1 and lines[1] == '':
                    current_content = '\n'.join(lines[2:])
                else:
                    current_content = '\n'.join(lines[1:])
            current_content = current_content.lstrip('\n')  # удаляем пустые строки в начале
            
            # Добавляем новую информацию о повторе в начало файла если задача выполнена
            new_content = current_content
            if mark and x_count > 0:
                next_repeat_date = calculate_ebbinghaus_next_date(x_count)
                header = f"════════════════════════════════════════\n"
                header += f"  Повтор: {next_repeat_date}\n"
                header += f"════════════════════════════════════════\n\n"
                new_content = header + current_content

            dst = os.path.join(proj_path, new_name)
            os.replace(src, dst)
            
            # Сохраняем обновленное содержимое в новый файл
            with open(dst, 'w', encoding='utf-8') as f:
                f.write(new_content)
            # add to completions as project work
            try:
                if mark:
                    conn = sqlite3.connect('habits.db')
                    cursor = conn.cursor()
                    today = date.today().isoformat()
                    core_name = os.path.splitext(new_name)[0]
                    # remove leading training marker (!) from project for clearer habit name
                    project_clean = project.lstrip('!')
                    habit_name = f'Работа по проекту ({project_clean} {core_name})'
                    category = 'Проекты'
                    cursor.execute('SELECT id FROM habits WHERE name = ? AND category = ?', (habit_name, category))
                    row = cursor.fetchone()
                    if row:
                        hid = row[0]
                    else:
                        cursor.execute('''INSERT INTO habits (name, category, description, i, s, w, e, c, h, st, money, is_composite, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                                       (habit_name, category, '', 0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0,1))
                        hid = cursor.lastrowid

                    # if planner provided deltas, use them for this completed_habits row
                    deltas = data.get('deltas') or {}
                    def _f(k):
                        try:
                            return float(deltas.get(k, 0) or 0.0)
                        except Exception:
                            return 0.0

                    i_v = _f('I')
                    s_v = _f('S')
                    w_v = _f('W')
                    e_v = _f('E')
                    c_v = _f('C')
                    h_v = _f('H')
                    st_v = _f('ST')
                    money_v = _f('$')

                    cursor.execute('''INSERT OR REPLACE INTO completed_habits (habit_id, subtask_id, date, quantity, success, i, s, w, e, c, h, st, money, notes, day_number, state, emotion_morning, thoughts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                                   (hid, None, today, 1, 1, i_v, s_v, w_v, e_v, c_v, h_v, st_v, money_v, f'{project} {new_name}', None, None, None, None))

                    cursor.execute('SELECT id FROM discipline_days WHERE date = ?', (today,))
                    if not cursor.fetchone():
                        cursor.execute('INSERT INTO discipline_days (date, day_number, state, completed_count, total_count) VALUES (?, ?, ?, ?, ?)', (today, 1, None, 1, 0))
                    else:
                        cursor.execute('UPDATE discipline_days SET completed_count = COALESCE(completed_count,0) + 1 WHERE date = ?', (today,))

                    conn.commit()
                    conn.close()
            except Exception as e:
                print('Error adding project work to completions:', e)

            return jsonify({'status':'success','filename': new_name, 'x_count': x_count, 'date': date_part})

        else:
            # обычное поведение: добавляем дату выполнения при пометке
            if mark and done_suffix not in name:
                today_str = date.today().isoformat()
                # вставляем дату перед суффиксом " выполнено"
                new_name = f"{name} {today_str}{done_suffix}{ext}"
            elif not mark and done_suffix in name:
                # при снятии отметки убираем дату и суффикс
                import re
                # name может содержать дату перед словом "выполнено"
                # удаляем дату и суффикс
                base = re.sub(r"\s\d{4}-\d{2}-\d{2}(?=\sвыполнено)", '', name)
                base = base.replace(done_suffix, '')
                new_name = base + ext
            else:
                new_name = filename

        dst = os.path.join(proj_path, new_name)
        os.replace(src, dst)

        # add to completions as project work for non-training projects
        try:
            if mark:
                conn = sqlite3.connect('habits.db')
                cursor = conn.cursor()
                today = date.today().isoformat()
                core_name = os.path.splitext(new_name)[0]
                project_clean = project.lstrip('!')
                habit_name = f'Работа по проекту ({project_clean} {core_name})'
                category = 'Проекты'
                cursor.execute('SELECT id FROM habits WHERE name = ? AND category = ?', (habit_name, category))
                row = cursor.fetchone()
                if row:
                    hid = row[0]
                else:
                    cursor.execute('''INSERT INTO habits (name, category, description, i, s, w, e, c, h, st, money, is_composite, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                                   (habit_name, category, '', 0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0,1))
                    hid = cursor.lastrowid

                deltas = data.get('deltas') or {}
                def _f(k):
                    try:
                        return float(deltas.get(k, 0) or 0.0)
                    except Exception:
                        return 0.0

                i_v = _f('I')
                s_v = _f('S')
                w_v = _f('W')
                e_v = _f('E')
                c_v = _f('C')
                h_v = _f('H')
                st_v = _f('ST')
                money_v = _f('$')

                cursor.execute('''INSERT OR REPLACE INTO completed_habits (habit_id, subtask_id, date, quantity, success, i, s, w, e, c, h, st, money, notes, day_number, state, emotion_morning, thoughts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                               (hid, None, today, 1, 1, i_v, s_v, w_v, e_v, c_v, h_v, st_v, money_v, f'{project} {new_name}', None, None, None, None))

                cursor.execute('SELECT id FROM discipline_days WHERE date = ?', (today,))
                if not cursor.fetchone():
                    cursor.execute('INSERT INTO discipline_days (date, day_number, state, completed_count, total_count) VALUES (?, ?, ?, ?, ?)', (today, 1, None, 1, 0))
                else:
                    cursor.execute('UPDATE discipline_days SET completed_count = COALESCE(completed_count,0) + 1 WHERE date = ?', (today,))

                conn.commit()
                conn.close()
        except Exception as e:
            print('Error adding project work to completions:', e)

        # Если пришли дельты характеристик — применим их к сегодняшнему дню
        try:
            deltas = data.get('deltas') or {}
            apply_deltas = any(k in deltas for k in ('I','S','W','E','C','H','ST','$'))
            if apply_deltas:
                conn = sqlite3.connect('habits.db')
                cursor = conn.cursor()
                today = date.today().isoformat()

                # Убедимся, что запись дисциплины существует
                cursor.execute('SELECT id FROM discipline_days WHERE date = ?', (today,))
                row = cursor.fetchone()
                if not row:
                    # вставим запись с нулями
                    cursor.execute('INSERT INTO discipline_days (date, day_number, state, completed_count, total_count) VALUES (?, ?, ?, ?, ?)', (today, 1, None, 0, 0))

                # Для каждого ключ прибавим к total_* поле
                fields_map = {'I':'total_i','S':'total_s','W':'total_w','E':'total_e','C':'total_c','H':'total_h','ST':'total_st','$':'total_money'}
                updates = {}
                for k,v in deltas.items():
                    if k in fields_map:
                        try:
                            val = float(v)
                        except Exception:
                            val = 0.0
                        updates[fields_map[k]] = updates.get(fields_map[k], 0.0) + val

                # Применяем обновления (агрегируем в SQL)
                if updates:
                    # Построим SET часть
                    set_parts = []
                    params = []
                    for f,add in updates.items():
                        set_parts.append(f + ' = COALESCE(' + f + ', 0) + ?')
                        params.append(add)
                    params.append(today)
                    sql = 'UPDATE discipline_days SET ' + ', '.join(set_parts) + ' WHERE date = ?'
                    cursor.execute(sql, params)

                    # Увеличим completed_count если пометка выполнения
                    if mark:
                        cursor.execute('UPDATE discipline_days SET completed_count = COALESCE(completed_count,0) + 1 WHERE date = ?', (today,))

                conn.commit()
                conn.close()
        except Exception as e:
            print('Error applying deltas from planner:', e)

        return jsonify({'status': 'success', 'filename': new_name})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == '__main__':
    print("=" * 80)
    print("🚀 Генератор отчетов дисциплины с БАЗОЙ ДАННЫХ")
    print("=" * 80)
    print("📍 Локальный сервер запущен по адресу: http://127.0.0.1:5000")
    print("")
    print("📊 ВОЗМОЖНОСТИ:")
    print("   • Полная интеграция с SQLite базой данных")
    print("   • Справочник привычек с характеристиками")
    print("   • Автоматический расчет стриков")
    print("   • Статистика за день/неделю/месяц/все время")
    print("   • Сравнение с предыдущими днями (стрелочки)")
    print("   • Счетчик дней дисциплины")
    print("")
    print("📡 ОСНОВНЫЕ API-ЭНДПОИНТЫ:")
    print("   GET  /api/habits          - справочник привычек")
    print("   POST /api/habits          - добавить привычку")
    print("   POST /api/completions     - сохранить выполнение")
    print("   GET  /api/stats/period    - статистика за период")
    print("   GET  /api/stats/streaks   - стрики привычек")
    print("   GET  /api/stats/total_days- общее количество дней")
    print("=" * 80)
    
    # Запускаем сервер
    app.run(debug=True, host='127.0.0.1', port=5000)
from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta, date
import json
import sqlite3

def register_stats_api(app, db):
    """Регистрирует REST API для статистики."""
    bp = Blueprint('stats', __name__, url_prefix='/api/stats')

    @bp.route('/period', methods=['GET'])
    def get_period_stats():
        """Получение статистики за период (week/month/all)"""
        try:
            period = request.args.get('period', 'week')
            target_date_str = request.args.get('date', date.today().isoformat())
            target_date = datetime.strptime(target_date_str, '%Y-%m-%d').date()
            
            # Определяем диапазон дат
            if period == 'week':
                start_date = target_date - timedelta(days=7)
            elif period == 'month':
                start_date = target_date - timedelta(days=30)
            else:  # all
                # Берем первый день из БД
                from pages.completions.model import Completion
                all_completions = db.list(Completion, order_by='date', limit=1)
                if all_completions:
                    first_date = all_completions[0]['date']
                    # Дата уже может быть объектом datetime.date из БД
                    if isinstance(first_date, date):
                        start_date = first_date
                    else:
                        start_date = datetime.strptime(str(first_date), '%Y-%m-%d').date()
                else:
                    start_date = target_date
            
            # Получаем все completion'ы и фильтруем в памяти
            from pages.completions.model import Completion
            all_completions = db.list(Completion, order_by='date')
            
            # Фильтруем по дате
            completions = []
            for c in all_completions:
                if c['date']:
                    c_date = c['date']
                    # Дата уже может быть объектом datetime.date из БД
                    if isinstance(c_date, date):
                        pass  # уже date
                    else:
                        c_date = datetime.strptime(str(c_date), '%Y-%m-%d').date()
                    if start_date <= c_date <= target_date:
                        completions.append(c)
            
            # Подсчитываем уникальные даты
            unique_dates = set()
            for c in completions:
                d = c['date']
                # Если это дата, преобразуем в строку для уникальности
                if isinstance(d, date):
                    unique_dates.add(d.isoformat())
                else:
                    unique_dates.add(str(d))
            days_count = len(unique_dates)
            
            stats = {
                'days_count': days_count,
                'sum_i': 0.0, 'sum_s': 0.0, 'sum_w': 0.0, 'sum_e': 0.0, 
                'sum_c': 0.0, 'sum_h': 0.0, 'sum_st': 0.0, 'sum_money': 0.0,
                'avg_i': 0.0, 'avg_s': 0.0, 'avg_w': 0.0, 'avg_e': 0.0,
                'avg_c': 0.0, 'avg_h': 0.0, 'avg_st': 0.0, 'avg_money': 0.0,
            }
            
            if days_count > 0:
                from pages.completions.completion_habits import CompletionHabits
                all_habits = db.list(CompletionHabits)
                
                # Суммируем статистику по completion_habits за эти completions
                for completion in completions:
                    completion_habits = [h for h in all_habits if h['completion_id'] == completion['id']]
                    for habit in completion_habits:
                        if habit['success']:
                            stats['sum_i'] += float(habit['i'] or 0)
                            stats['sum_s'] += float(habit['s'] or 0)
                            stats['sum_w'] += float(habit['w'] or 0)
                            stats['sum_e'] += float(habit['e'] or 0)
                            stats['sum_c'] += float(habit['c'] or 0)
                            stats['sum_h'] += float(habit['hh'] or 0)
                            stats['sum_st'] += float(habit['st'] or 0)
                            stats['sum_money'] += float(habit['money'] or 0)
                
                # Средние значения
                stats['avg_i'] = stats['sum_i'] / days_count
                stats['avg_s'] = stats['sum_s'] / days_count
                stats['avg_w'] = stats['sum_w'] / days_count
                stats['avg_e'] = stats['sum_e'] / days_count
                stats['avg_c'] = stats['sum_c'] / days_count
                stats['avg_h'] = stats['sum_h'] / days_count
                stats['avg_st'] = stats['sum_st'] / days_count
                stats['avg_money'] = stats['sum_money'] / days_count
            
            # Данные по дням для графики
            days_data = []
            from pages.completions.completion_habits import CompletionHabits
            all_habits = db.list(CompletionHabits)
            
            for completion in completions:
                completion_habits = [h for h in all_habits if h['completion_id'] == completion['id']]
                # Преобразуем дату в строку для JSON
                c_date = completion['date']
                if isinstance(c_date, date):
                    c_date = c_date.isoformat()
                day_totals = {'date': c_date, 'I': 0, 'S': 0, 'W': 0, 'E': 0, 'C': 0, 'H': 0}
                for habit in completion_habits:
                    if habit['success']:
                        day_totals['I'] += float(habit['i'] or 0)
                        day_totals['S'] += float(habit['s'] or 0)
                        day_totals['W'] += float(habit['w'] or 0)
                        day_totals['E'] += float(habit['e'] or 0)
                        day_totals['C'] += float(habit['c'] or 0)
                        day_totals['H'] += float(habit['hh'] or 0)
                days_data.append(day_totals)
            
            return jsonify({
                'status': 'success',
                'period': period,
                'start_date': start_date.isoformat(),
                'end_date': target_date.isoformat(),
                'stats': stats,
                'days_data': days_data,
                'comparison': {}
            })
        except Exception as e:
            import traceback
            print(traceback.format_exc())
            return jsonify({'status': 'error', 'message': str(e)}), 500

    @bp.route('/streaks', methods=['GET'])
    def get_streaks():
        """Получение текущих стриков привычек по количеству успешных completions"""
        try:
            from pages.habits.model import Habit
            from pages.completions.completion_habits import CompletionHabits
            
            habits = db.list(Habit)
            all_completion_habits = db.list(CompletionHabits, order_by='id DESC')
            
            streaks = {}
            
            for habit in habits:
                # Найдем completion_habits для этой привычки, отсортированные по ID (новые сначала)
                habit_entries = [h for h in all_completion_habits if h['habit_id'] == habit['id']]
                
                if habit_entries:
                    # Подсчитываем streak от последнего успешного
                    streak_count = 0
                    for entry in habit_entries:
                        if entry['success']:
                            streak_count += 1
                        else:
                            break
                    
                    streaks[habit['id']] = {
                        'current_streak': streak_count,
                        'max_streak': streak_count,
                        'habit_name': habit['name'],
                        'habit_category': (habit['category'] or 'Без категории')
                    }
                else:
                    streaks[habit['id']] = {
                        'current_streak': 0,
                        'max_streak': 0,
                        'habit_name': habit['name'],
                        'habit_category': (habit['category'] or 'Без категории')
                    }
            
            return jsonify({'status': 'success', 'streaks': streaks})
        except Exception as e:
            import traceback
            print(traceback.format_exc())
            return jsonify({'status': 'error', 'message': str(e)}), 500

    @bp.route('/daily_comparison', methods=['GET'])
    def get_daily_comparison():
        """Сравнение характеристик сегодня с вчера"""
        try:
            target_date_str = request.args.get('date', date.today().isoformat())
            target_date = datetime.strptime(target_date_str, '%Y-%m-%d').date()
            prev_date = target_date - timedelta(days=1)
            
            from pages.completions.model import Completion
            from pages.completions.completion_habits import CompletionHabits
            
            # Получаем completion на целевой день
            all_completions = db.list(Completion)
            
            # Фильтруем completions на целевой день
            today_completions = []
            for c in all_completions:
                c_date = c['date']
                if isinstance(c_date, date):
                    if c_date == target_date:
                        today_completions.append(c)
                else:
                    if datetime.strptime(str(c_date), '%Y-%m-%d').date() == target_date:
                        today_completions.append(c)
            
            comparison = {}
            if today_completions:
                all_habits = db.list(CompletionHabits)
                
                # Суммируем stats за сегодня
                today_stats = {'I': 0, 'S': 0, 'W': 0, 'E': 0, 'C': 0, 'H': 0, 'ST': 0, '$': 0}
                for completion in today_completions:
                    habits = [h for h in all_habits if h['completion_id'] == completion['id']]
                    for habit in habits:
                        if habit['success']:
                            today_stats['I'] += float(habit['i'] or 0)
                            today_stats['S'] += float(habit['s'] or 0)
                            today_stats['W'] += float(habit['w'] or 0)
                            today_stats['E'] += float(habit['e'] or 0)
                            today_stats['C'] += float(habit['c'] or 0)
                            today_stats['H'] += float(habit['hh'] or 0)
                            today_stats['ST'] += float(habit['st'] or 0)
                            today_stats['$'] += float(habit['money'] or 0)
                
                # Суммируем stats за вчера
                prev_completions = []
                for c in all_completions:
                    c_date = c['date']
                    if isinstance(c_date, date):
                        if c_date == prev_date:
                            prev_completions.append(c)
                    else:
                        if datetime.strptime(str(c_date), '%Y-%m-%d').date() == prev_date:
                            prev_completions.append(c)
                prev_stats = {'I': 0, 'S': 0, 'W': 0, 'E': 0, 'C': 0, 'H': 0, 'ST': 0, '$': 0}
                for completion in prev_completions:
                    habits = [h for h in all_habits if h['completion_id'] == completion['id']]
                    for habit in habits:
                        if habit['success']:
                            prev_stats['I'] += float(habit['i'] or 0)
                            prev_stats['S'] += float(habit['s'] or 0)
                            prev_stats['W'] += float(habit['w'] or 0)
                            prev_stats['E'] += float(habit['e'] or 0)
                            prev_stats['C'] += float(habit['c'] or 0)
                            prev_stats['H'] += float(habit['hh'] or 0)
                            prev_stats['ST'] += float(habit['st'] or 0)
                            prev_stats['$'] += float(habit['money'] or 0)
                
                # Сравниваем
                for stat in ['I', 'S', 'W', 'E', 'C', 'H', 'ST', '$']:
                    if prev_stats[stat] == 0:
                        comparison[stat] = '↑' if today_stats[stat] > 0 else ('↓' if today_stats[stat] < 0 else '→')
                    else:
                        change_pct = ((today_stats[stat] - prev_stats[stat]) / abs(prev_stats[stat])) * 100
                        comparison[stat] = '↑' if change_pct > 5 else ('↓' if change_pct < -5 else '→')
            
            return jsonify({'status': 'success', 'comparison': comparison})
        except Exception as e:
            import traceback
            print(traceback.format_exc())
            return jsonify({'status': 'error', 'message': str(e)}), 500

    app.register_blueprint(bp)



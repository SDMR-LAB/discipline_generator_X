"""
Статистика и аналитика для дисциплины
"""

from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta, date

def register_stats_api(app, db):
    """Регистрирует API endpoints для статистики."""
    bp = Blueprint('stats', __name__, url_prefix='/api/stats')

    @bp.route('/period', methods=['GET'])
    def get_period_stats():
        """Получение статистики за период (week, month, all)"""
        try:
            period = request.args.get('period', 'week')
            target_date_str = request.args.get('date', date.today().isoformat())
            target_date = datetime.strptime(target_date_str, '%Y-%m-%d').date()
            
            # Определяем дату начала
            if period == 'week':
                start_date = target_date - timedelta(days=7)
            elif period == 'month':
                start_date = target_date - timedelta(days=30)
            elif period == 'all':
                start_date = date(2000, 1, 1)
            else:
                start_date = target_date - timedelta(days=7)

            from pages.completions.model import Completion
            from pages.completions.completion_habits import CompletionHabits
            
            # Получаем все completions за период
            all_completions = [c.to_dict() if hasattr(c, 'to_dict') else c for c in db.list(Completion)]
            completions = []
            for c in all_completions:
                c_date_str = c.get('date', '') if isinstance(c, dict) else c['date']
                if c_date_str:
                    c_date = datetime.strptime(c_date_str, '%Y-%m-%d').date()
                    if start_date <= c_date <= target_date:
                        completions.append(c)

            # Суммируем статистику
            stats = {
                'sum_i': 0, 'sum_s': 0, 'sum_w': 0, 'sum_e': 0, 'sum_c': 0,
                'sum_h': 0, 'sum_st': 0, 'sum_money': 0,
                'avg_i': 0, 'avg_s': 0, 'avg_w': 0, 'avg_e': 0, 'avg_c': 0,
                'avg_h': 0, 'avg_st': 0, 'avg_money': 0,
                'days_count': 0
            }

            all_habits = [h.to_dict() if hasattr(h, 'to_dict') else h for h in db.list(CompletionHabits)]

            for completion in completions:
                comp_id = completion.get('id') if isinstance(completion, dict) else completion['id']
                completion_habits = [h for h in all_habits if h.get('completion_id') == comp_id]
                for habit in completion_habits:
                    if habit.get('success'):
                        stats['sum_i'] += float(habit.get('i') or 0)
                        stats['sum_s'] += float(habit.get('s') or 0)
                        stats['sum_w'] += float(habit.get('w') or 0)
                        stats['sum_e'] += float(habit.get('e') or 0)
                        stats['sum_c'] += float(habit.get('c') or 0)
                        stats['sum_h'] += float(habit.get('hh') or 0)
                        stats['sum_st'] += float(habit.get('st') or 0)
                        stats['sum_money'] += float(habit.get('money') or 0)

            # Среднее значение
            days_count = len(completions) if completions else 1
            stats['days_count'] = days_count
            if days_count > 0:
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
            for completion in completions:
                comp_id = completion.get('id') if isinstance(completion, dict) else completion['id']
                completion_habits = [h for h in all_habits if h.get('completion_id') == comp_id]
                day_date = completion.get('date') if isinstance(completion, dict) else completion['date']
                day_totals = {'date': day_date, 'I': 0, 'S': 0, 'W': 0, 'E': 0, 'C': 0, 'H': 0}
                for habit in completion_habits:
                    if habit.get('success'):
                        day_totals['I'] += float(habit.get('i') or 0)
                        day_totals['S'] += float(habit.get('s') or 0)
                        day_totals['W'] += float(habit.get('w') or 0)
                        day_totals['E'] += float(habit.get('e') or 0)
                        day_totals['C'] += float(habit.get('c') or 0)
                        day_totals['H'] += float(habit.get('hh') or 0)
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
        """Получение текущих стриков привычек"""
        try:
            from pages.habits.model import Habit
            from pages.completions.completion_habits import CompletionHabits

            habits = [h.to_dict() if hasattr(h, 'to_dict') else h for h in db.list(Habit)]
            all_completion_habits = [h.to_dict() if hasattr(h, 'to_dict') else h for h in db.list(CompletionHabits, order_by='id DESC')]

            streaks = {}

            for habit in habits:
                habit_id = habit.get('id') if isinstance(habit, dict) else habit['id']
                # Найдем completion_habits для этой привычки
                habit_entries = [h for h in all_completion_habits if h.get('habit_id') == habit_id]

                if habit_entries:
                    # Подсчитываем streak от последнего успешного
                    streak_count = 0
                    for entry in habit_entries:
                        if entry.get('success'):
                            streak_count += 1
                        else:
                            break

                    habit_name = habit.get('name') if isinstance(habit, dict) else habit['name']
                    habit_category = habit.get('category') if isinstance(habit, dict) else habit['category']
                    streaks[habit_id] = {
                        'current_streak': streak_count,
                        'max_streak': streak_count,
                        'habit_name': habit_name,
                        'habit_category': habit_category or 'Без категории'
                    }
                else:
                    habit_name = habit.get('name') if isinstance(habit, dict) else habit['name']
                    habit_category = habit.get('category') if isinstance(habit, dict) else habit['category']
                    streaks[habit_id] = {
                        'current_streak': 0,
                        'max_streak': 0,
                        'habit_name': habit_name,
                        'habit_category': habit_category or 'Без категории'
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
            all_completions = [c.to_dict() if hasattr(c, 'to_dict') else c for c in db.list(Completion)]
            today_completions = [c for c in all_completions if c.get('date') == target_date_str]

            comparison = {}
            if today_completions:
                all_habits = [h.to_dict() if hasattr(h, 'to_dict') else h for h in db.list(CompletionHabits)]

                # Суммируем stats за сегодня
                today_stats = {'I': 0, 'S': 0, 'W': 0, 'E': 0, 'C': 0, 'H': 0, 'ST': 0, '$': 0}
                for completion in today_completions:
                    comp_id = completion.get('id') if isinstance(completion, dict) else completion['id']
                    habits = [h for h in all_habits if h.get('completion_id') == comp_id]
                    for habit in habits:
                        if habit.get('success'):
                            today_stats['I'] += float(habit.get('i') or 0)
                            today_stats['S'] += float(habit.get('s') or 0)
                            today_stats['W'] += float(habit.get('w') or 0)
                            today_stats['E'] += float(habit.get('e') or 0)
                            today_stats['C'] += float(habit.get('c') or 0)
                            today_stats['H'] += float(habit.get('hh') or 0)
                            today_stats['ST'] += float(habit.get('st') or 0)
                            today_stats['$'] += float(habit.get('money') or 0)

                # Суммируем stats за вчера
                prev_completions = [c for c in all_completions if c.get('date') == prev_date.isoformat()]
                prev_stats = {'I': 0, 'S': 0, 'W': 0, 'E': 0, 'C': 0, 'H': 0, 'ST': 0, '$': 0}
                for completion in prev_completions:
                    comp_id = completion.get('id') if isinstance(completion, dict) else completion['id']
                    habits = [h for h in all_habits if h.get('completion_id') == comp_id]
                    for habit in habits:
                        if habit.get('success'):
                            prev_stats['I'] += float(habit.get('i') or 0)
                            prev_stats['S'] += float(habit.get('s') or 0)
                            prev_stats['W'] += float(habit.get('w') or 0)
                            prev_stats['E'] += float(habit.get('e') or 0)
                            prev_stats['C'] += float(habit.get('c') or 0)
                            prev_stats['H'] += float(habit.get('hh') or 0)
                            prev_stats['ST'] += float(habit.get('st') or 0)
                            prev_stats['$'] += float(habit.get('money') or 0)

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

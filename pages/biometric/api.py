from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from core.db import Database
from pages.biometric.model import MentalDaily, Measurement, PhysicalActivity
import sqlite3

def register_biometric_api(app, db):
    bp = Blueprint('biometric_api', __name__, url_prefix='/api/biometric')

    @bp.route('/mental/trend', methods=['GET'])
    def mental_trend():
        """Возвращает данные для графиков ментальных показателей за последние N дней."""
        days = int(request.args.get('days', 30))
        end_date = datetime.today().date()
        start_date = end_date - timedelta(days=days)

        conn = db.get_conn()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT date, focus, attention, thinking_speed, energy, mood
            FROM biometric_mental_daily
            WHERE date BETWEEN ? AND ?
            ORDER BY date
        """, (start_date.isoformat(), end_date.isoformat()))
        rows = cursor.fetchall()
        conn.close()

        data = []
        for row in rows:
            data.append({
                'date': row['date'],
                'focus': row['focus'],
                'attention': row['attention'],
                'thinking_speed': row['thinking_speed'],
                'energy': row['energy'],
                'mood': row['mood'],
            })
        return jsonify({'status': 'success', 'data': data})

    @bp.route('/measurements/weight', methods=['GET'])
    def weight_trend():
        """Возвращает данные веса за последние N дней."""
        days = int(request.args.get('days', 30))
        end_date = datetime.today().date()
        start_date = end_date - timedelta(days=days)

        conn = db.get_conn()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT date, weight
            FROM biometric_measurements
            WHERE date BETWEEN ? AND ? AND weight IS NOT NULL
            ORDER BY date
        """, (start_date.isoformat(), end_date.isoformat()))
        rows = cursor.fetchall()
        conn.close()

        data = [{'date': row['date'], 'weight': row['weight']} for row in rows]
        return jsonify({'status': 'success', 'data': data})

    @bp.route('/activity/summary', methods=['GET'])
    def activity_summary():
        """Суммарная длительность активности по видам за период."""
        period = request.args.get('period', 'month')
        end_date = datetime.today().date()
        if period == 'week':
            start_date = end_date - timedelta(days=7)
        elif period == 'month':
            start_date = end_date - timedelta(days=30)
        else:
            start_date = end_date - timedelta(days=365)

        conn = db.get_conn()
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT activity_type, SUM(duration_minutes) as total_minutes
            FROM biometric_physical_activity
            WHERE date BETWEEN ? AND ?
            GROUP BY activity_type
            ORDER BY total_minutes DESC
        """, (start_date.isoformat(), end_date.isoformat()))
        rows = cursor.fetchall()
        conn.close()

        data = [{'activity_type': row['activity_type'], 'total_minutes': row['total_minutes']} for row in rows]
        return jsonify({'status': 'success', 'data': data})

    app.register_blueprint(bp)
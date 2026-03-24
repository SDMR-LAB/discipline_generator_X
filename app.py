from flask import Flask, send_file
import logging
import os

logging.basicConfig(level=logging.INFO)

app = Flask(__name__, static_folder='static')

# Import entities FIRST (before Database creation)
from pages.completions.model import Completion
from pages.completions.completion_habits import CompletionHabits
from pages.habits.model import Habit
from pages.combinations.model import Combination

# === НОВОЕ: импорт планировщика ===
from core.planner import register_planner

# Now create the database – tables will be created immediately
from core.db import Database
from core.api import register_entity_blueprint
from core.stats_api import register_stats_api

db = Database('habits.db')
print("✓ Database initialized")
import sqlite3
conn = sqlite3.connect('habits.db')
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = cursor.fetchall()
print(f"✓ Tables created: {tables}")
conn.close()

# Register APIs for all entities
register_entity_blueprint(app, Completion, db)
register_entity_blueprint(app, CompletionHabits, db)
register_entity_blueprint(app, Habit, db)
register_entity_blueprint(app, Combination, db)

# Register statistics API
register_stats_api(app, db)

# === НОВОЕ: регистрация планировщика ===
register_planner(app, db)

# Ensure tables (optional, already done by Database.__init__)
db.ensure_tables()

@app.route('/report')
def report_page():
    """Serve the discipline report generator page"""
    return send_file('static/report.html', mimetype='text/html')

@app.route('/planner')
def planner_page():
    return app.send_static_file('planner.html')

@app.route('/')
def index():
    """Main dashboard page"""
    return send_file('static/index.html', mimetype='text/html')

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
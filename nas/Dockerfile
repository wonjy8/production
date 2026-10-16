FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home app
COPY browser_gateway.py server.py resources.py completion.py access.py accounts.py local_auth.py setup_admin.py schema.sql ./
RUN chmod 0644 /app/*.py /app/schema.sql
USER app
EXPOSE 8787
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8787", "--workers", "1", "--no-access-log"]

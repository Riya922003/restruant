# RestaurantOS AI service (FastAPI). Python pinned to the 3.12 runtime the code
# and wheels target.
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# psycopg[binary], cloudinary, veryfi, rq, redis all ship wheels, so no system
# build toolchain is required. Copy requirements first for layer caching.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

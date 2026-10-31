FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HF_HOME=/models
WORKDIR /srv
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu "torch>=2.2,<3"
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Bake the pretrained weights into the image (Apache-2.0, ~190 MB).
RUN python -c "from chronos import BaseChronosPipeline; BaseChronosPipeline.from_pretrained('amazon/chronos-bolt-small', device_map='cpu')"
COPY main.py .
RUN useradd -r forecast && chown -R forecast /srv /models
USER forecast
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

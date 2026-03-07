from fastapi import FastAPI

app = FastAPI(title='ghostux-analytics')


@app.get('/')
async def root():
    return {"status": "ok", "service": "ghostux-analytics"}

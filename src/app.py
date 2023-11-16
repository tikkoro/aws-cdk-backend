from fastapi import FastAPI
from mangum import Mangum
from sample import sample

app = FastAPI()
handler = Mangum(app)

@app.get("/hello", status_code=200)
async def root():
    return "Hello World"

@app.get("/sample", status_code=200)
async def root():
    return sample()

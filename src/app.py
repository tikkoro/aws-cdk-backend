from fastapi import FastAPI, Depends
from fastapi.security import APIKeyHeader

from mangum import Mangum
from sample import sample

# Local
# app = FastAPI(
#     title="sample",
# )

# AWS
app = FastAPI(
    title="sample",
    root_path="/dev",
    servers=[
        {"url": "/dev", "description": "Staging environment"},
        {"url": "/prod", "description": "Production environment"},
    ],
)

handler = Mangum(app)


# Local
# @app.get("/hello")
# async def root():
#     return "Hello World"


# @app.get("/sample")
# async def root():
#     return sample()


# AWS
# Define request header
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


@app.get("/hello", dependencies=[Depends(api_key_header)])
async def root():
    return "Hello World"


@app.get("/sample", dependencies=[Depends(api_key_header)])
async def root():
    return sample()

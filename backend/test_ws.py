import asyncio
import websockets
import json

async def test():
    async with websockets.connect('ws://localhost:8000/ws') as ws:
        msg = await ws.recv()
        data = json.loads(msg)
        print("KEYS:", data.keys())
        print("VEHICLES:", len(data.get('vehicles', [])))
        if data.get('vehicles'):
            print("FIRST VEHICLE:", data['vehicles'][0])

asyncio.run(test())

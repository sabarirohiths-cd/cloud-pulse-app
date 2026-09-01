import asyncio
import json

class EventBus:
    def __init__(self):
        self._queues = []

    def subscribe(self):
        q = asyncio.Queue()
        self._queues.append(q)
        return q

    def unsubscribe(self, q):
        if q in self._queues:
            self._queues.remove(q)

    async def publish(self, topic: str, data: dict):
        message = json.dumps({"topic": topic, "data": data})
        for q in self._queues:
            await q.put(message)

# Global event bus instance
event_bus = EventBus()

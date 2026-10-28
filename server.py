import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from main import app as graph  # your compiled LangGraph (from main.py)

app = FastAPI(title="Content Workflow API")

# "*" is fine for a local demo. Use your real frontend URL when you deploy.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class TopicRequest(BaseModel):
    topic: str


def describe(node: str, update: dict | None) -> dict:
    """Turn one graph step into a short line for the UI timeline."""
    if node != "supervisor":
        return {"who": node, "event": "submitted", "note": ""}
    if not update:
        return {"who": "supervisor", "event": "assigned", "note": ""}
    if update.get("feedback_notes"):
        return {"who": "supervisor", "event": "sent_back", "note": update["feedback_notes"]}
    return {"who": "supervisor", "event": "accepted", "note": update.get("current_stage", "")}


# Plain "def" (not "async def"): FastAPI runs it in a thread, so the long
# LangGraph run does not freeze the server.
@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/run-workflow")
def run_workflow(request: TopicRequest):
    state = {
        "topic": request.topic,
        "research_draft": "",
        "final_article": "",
        "social_post": "",
        "feedback_notes": "",
        "current_stage": "research",
        "attempts": 0,
    }
    steps = []
    try:
        for chunk in graph.stream(state, {"recursion_limit": 25}, stream_mode="updates"):
            for node, update in chunk.items():
                update = update if isinstance(update, dict) else None
                steps.append(describe(node, update))
                state.update(update or {})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "status": "success",
        "research_draft": state["research_draft"],
        "final_article": state["final_article"],
        "social_post": state["social_post"],
        "steps": steps,
    }


if __name__ == "__main__":
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
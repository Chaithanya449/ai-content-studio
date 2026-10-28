from typing import Literal, TypedDict
from dotenv import load_dotenv

# FIXED IMPORTS
from langchain.chat_models import init_chat_model
from langchain_tavily import TavilySearch
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import create_react_agent  # Fixed agent creator
from langgraph.types import Command
from pydantic import BaseModel

load_dotenv()

# Gemini 3.5 Flash Lite initialization
llm = init_chat_model("google_genai:gemini-3.5-flash-lite", timeout=60, max_retries=2)


# ---------- Shared state ----------
class State(TypedDict):
    topic: str            # written by: user
    research_draft: str   # written by: researcher
    final_article: str    # written by: blog_manager
    social_post: str      # written by: social_media_manager
    feedback_notes: str   # written by: supervisor
    current_stage: str    # written by: supervisor (research -> blog -> social -> complete)
    attempts: int         # written by: supervisor (reviews done for current stage)


# ---------- Workers ----------
research_agent = create_react_agent(
    llm,
    tools=[TavilySearch(max_results=3)],
    prompt=(
        "You are an online researcher. Search the web and write an "
        "organised outline of facts, figures and sources."
    ),
)


def ask(prompt: str) -> str:
    
    return llm.invoke(prompt).text


def add_feedback(prompt: str, notes: str) -> str:
    if notes:
        return f"{prompt}\n\nYour manager's feedback. Fix these points:\n{notes}"
    return prompt


def researcher(state: State):
    prompt = add_feedback(f"Research this topic: {state['topic']}", state["feedback_notes"])
    result = research_agent.invoke({"messages": [("user", prompt)]})
    
    return {"research_draft": result["messages"][-1].text}


def blog_manager(state: State):
    prompt = add_feedback(
        "You are a senior editor. Write an engaging, SEO-friendly blog article "
        "from the research below. Use a hook, an intro, H2 headings and a "
        "conclusion. Use only facts from the research.\n\n"
        f"Research:\n{state['research_draft']}",
        state["feedback_notes"],
    )
    return {"final_article": ask(prompt)}


def social_media_manager(state: State):
    prompt = add_feedback(
        "You are a social media manager. Write one tweet under 280 characters "
        "with a strong first-line hook and 2-3 hashtags, based on this "
        f"article.\n\nArticle:\n{state['final_article']}",
        state["feedback_notes"],
    )
    return {"social_post": ask(prompt)}


# ---------- Supervisor ----------
STAGE_FIELD = {"research": "research_draft", "blog": "final_article", "social": "social_post"}
STAGE_WORKER = {"research": "researcher", "blog": "blog_manager", "social": "social_media_manager"}
NEXT_STAGE = {"research": "blog", "blog": "social", "social": "complete"}

CRITERIA = {
    "research": "Covers the exact topic, has concrete facts or figures, is organised "
    "as an outline, and mentions sources.",
    "blog": "Strong hook, clear H2 headings, main keyword in title and intro, uses "
    "only facts from the research, and has a conclusion.",
    "social": "Under 280 characters, strong first-line hook, 2-3 hashtags, and "
    "matches the article's main point.",
}

MAX_REVIEWS = 2


class Verdict(BaseModel):
    approved: bool
    feedback: str  # what to fix (empty if approved)


def review(stage: str, work: str) -> Verdict:
    prompt = (
        f"You are a strict content manager. Review this {stage} work.\n"
        f"Criteria: {CRITERIA[stage]}\n\nWork:\n{work}\n\n"
        "Return approved true or false. If false, give short, specific feedback."
    )
    return llm.with_structured_output(Verdict).invoke(prompt)  # type: ignore


def supervisor(
    state: State,
) -> Command[Literal["researcher", "blog_manager", "social_media_manager", "__end__"]]:
    stage = state["current_stage"]
    work = state[STAGE_FIELD[stage]]

    # First visit: nothing submitted yet, so send the topic to the researcher
    if not work:
        return Command(goto=STAGE_WORKER[stage])

    # Review the submitted work (code counts the reviews, not the LLM)
    attempts = state["attempts"] + 1
    verdict = review(stage, work)
    print(f"[supervisor] {stage} review {attempts}/{MAX_REVIEWS}: approved={verdict.approved}")

    # Approved, or out of reviews -> accept and move to the next stage
    if verdict.approved or attempts >= MAX_REVIEWS:
        next_stage = NEXT_STAGE[stage]
        update = {"current_stage": next_stage, "feedback_notes": "", "attempts": 0}
        if next_stage == "complete":
            return Command(goto=END, update=update)
        return Command(goto=STAGE_WORKER[next_stage], update=update)

    # Not approved yet -> send back to the same worker with feedback
    return Command(
        goto=STAGE_WORKER[stage],
        update={"feedback_notes": verdict.feedback, "attempts": attempts},
    )


# ---------- Graph ----------
builder = StateGraph(State)
builder.add_node("supervisor", supervisor)
builder.add_node("researcher", researcher)
builder.add_node("blog_manager", blog_manager)
builder.add_node("social_media_manager", social_media_manager)

builder.add_edge(START, "supervisor")
# Strict supervision: every worker can only go back to the supervisor
for worker in ("researcher", "blog_manager", "social_media_manager"):
    builder.add_edge(worker, "supervisor")

app = builder.compile()


if __name__ == "__main__":
    print(app.get_graph().draw_mermaid())
    topic = input("Topic: ").strip()
    result = app.invoke(
        {
            "topic": topic,
            "research_draft": "",
            "final_article": "",
            "social_post": "",
            "feedback_notes": "",
            "current_stage": "research",
            "attempts": 0,
        },
        {"recursion_limit": 25},
    )
    print("\n=== FINAL ARTICLE ===\n")
    print(result["final_article"])
    print("\n=== SOCIAL POST ===\n")
    print(result["social_post"])

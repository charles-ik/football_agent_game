"""FastAPI service wrapping the football_agent engine.

The engine is the asset and stays untouched; this package only maps its action
surface onto JSON endpoints, holds sessions, and hides hidden state.
"""

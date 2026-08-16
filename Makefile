# Football Agent — dev loop
#
#   make dev      both halves at once (API on :8000, web on :3000)
#   make api      just the FastAPI service
#   make web      just the Next.js dev server
#   make test     engine + API tests

.PHONY: dev api web test

api:
	python3 -m uvicorn api.main:app --reload --port 8000 --host 127.0.0.1 --workers 1

web:
	cd web && npm run dev

dev:
	@$(MAKE) api & $(MAKE) web & wait

test:
	python3 -m pytest tests/ -q

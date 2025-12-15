deploy_env?=dev

.PHONY: dev prod logs reset test lighthouse

dev:
	bun install --ignore-scripts
	docker compose --profile dev up --build

prod:
	docker compose --profile prod up --build -d

logs:
	docker compose logs -f

reset:
	docker compose down -v
	rm -rf node_modules

test:
	bun run lint

lighthouse:
	scripts/perf-audit

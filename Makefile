deploy_env?=dev

.PHONY: dev prod logs reset test lighthouse

dev:
	pnpm install --recursive --ignore-scripts
	docker compose --profile dev up --build

prod:
	docker compose --profile prod up --build -d

logs:
	docker compose logs -f

reset:
	docker compose down -v
	rm -rf apps/api/drizzle
	rm -rf node_modules

test:
	pnpm lint

lighthouse:
	scripts/perf-audit

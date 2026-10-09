# zan

Email yourself `todo: …` from Gmail → it shows up at https://tuvshinselenge.github.io/mail-todo/

## Writing todos

Send an email **from your Gmail to your Gmail**. Every line (subject or body) starting with `todo:` becomes a todo:

```
todo: buy milk
todo: homework due to 15.10.2026
todo: pay rent due tomorrow
```

Due formats: `due` / `due to` / `due:` followed by `DD.MM.YYYY`, `DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM`, `today` or `tomorrow`.
It takes up to ~2 minutes to appear.

## Development

- `npm test`: unit tests (parser, inbox, API, display logic)
- `npm run mock`: local UI at http://localhost:8787 with a fake API (key: `test`)
- Backend: `npx @google/clasp@2.4.2 push --force`, then `npx @google/clasp@2.4.2 deploy -i <DEPLOYMENT_ID> --description "vN"`
- Frontend: push to `main`. GitHub Actions tests and deploys `web/`.

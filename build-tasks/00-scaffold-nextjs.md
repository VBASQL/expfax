# Task 00 — Scaffold Next.js Project

## Goal
Create the Next.js 15 project with all dependencies installed and folder structure ready.

## Steps

### 1. Create Next.js project
Run in the `expfax` workspace root (NOT inside build-tasks):
```powershell
npx create-next-app@latest expfax-portal --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

### 2. Navigate into project
```powershell
cd expfax-portal
```

### 3. Install core dependencies
```powershell
npm install @azure/cosmos @azure/identity @azure/keyvault-secrets arctic @oslojs/crypto @oslojs/encoding sharp pdf-lib uuid zod date-fns xml2js
```

### 4. Install shadcn/ui
```powershell
npx shadcn@latest init -d
```

### 5. Add shadcn components (run each separately)
```powershell
npx shadcn@latest add button card input label table badge dialog dropdown-menu separator sheet tabs textarea toast avatar select command popover calendar checkbox scroll-area tooltip
```

### 6. Install dev dependencies
```powershell
npm install -D @types/uuid @types/xml2js
```

### 7. Create folder structure
Create these empty directories inside `src/`:
```
src/
├── app/
│   ├── (auth)/login/
│   ├── (portal)/
│   │   ├── inbox/[id]/
│   │   ├── sent/[id]/
│   │   ├── status/
│   │   ├── contacts/
│   │   ├── covers/
│   │   ├── history/
│   │   ├── settings/
│   │   └── admin/users/
│   │   └── admin/system/
│   └── api/
│       ├── auth/
│       ├── fax/
│       ├── contacts/
│       ├── templates/
│       └── sse/
├── lib/
│   ├── faxback/
│   ├── auth/
│   ├── db/
│   └── services/
├── components/
│   ├── ui/          (already created by shadcn)
│   ├── fax/
│   ├── contacts/
│   └── layout/
└── types/
```

### 8. Create placeholder `src/types/index.ts`
```typescript
// ExpFax Portal — shared types
// Types will be defined in task 12-db-schema-types

export {};
```

## Verify
- Run `npm run dev` — the default Next.js page should load at http://localhost:3000
- Run `npm run build` — should build with no errors

## Files Created
- Full Next.js project in `expfax-portal/`
- All dependency packages in `node_modules/`
- Empty folder structure ready for subsequent tasks

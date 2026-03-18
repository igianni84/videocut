---
description: "Review UX/UI del frontend Next.js. Usa quando crei/modifichi componenti in apps/web/src/components/, lavori su pages/layouts, o vuoi verificare l'esperienza utente."
---

# VideoCut UI/UX Review

Esegui una review UX/UI del frontend (`apps/web/`).

## Istruzioni

1. **Identifica i file modificati:** Usa `git diff --name-only` per trovare i file frontend cambiati.
   - Se l'utente specifica file/feature, concentrati su quelli
   - Se non specificato, analizza tutti i file modificati in `apps/web/`

2. **Leggi il contesto:** Per ogni componente, leggi anche: parent layout, hooks usati, tipi importati.

3. **Testa il flusso UX** mentalmente: simula il percorso utente per la feature modificata.

4. **Applica la checklist** sotto.

5. **Report finale:** Per ogni finding, indica file:linea, problema, fix suggerita con priorità (P0 critico, P1 importante, P2 miglioramento).

## Checklist

### Component Architecture
- Componenti in `components/{feature}/ComponentName.tsx`
- Props fully typed (no `any`, no implicit)
- Separazione presentational vs container components
- Riuso componenti shadcn/ui base (`components/ui/`)
- Event handler tipizzati correttamente

### UX Flow (specifico VideoCut)
- **Upload:** drag-and-drop + click, progress visibile, cancel/retry supportato, validazione file inline
- **Processing:** status in tempo reale (realtime subscription), progress bar con percentuale, stima tempo
- **Preview:** player funzionante con controlli, download chiaro e accessibile
- **Error states:** messaggi user-friendly in italiano/inglese, retry possibile, no stack trace esposti
- **Loading states:** skeleton/spinner su ogni operazione async
- **Empty states:** messaggio chiaro + CTA quando non ci sono video/jobs
- **Success feedback:** toast/notification dopo upload, processing completato, download

### Responsive Design
- Mobile-first approach (min 375px)
- Dashboard usabile su mobile
- Upload zone adattiva (full-width su mobile)
- Video player responsive (aspect ratio preservato)
- Dialog/modal scrollabili su schermi piccoli
- Navigation mobile-friendly (hamburger menu o bottom nav)

### Accessibility (a11y)
- `<label>` associato a ogni input (htmlFor)
- Alt text su immagini, aria-hidden su icone decorative
- Focus management nei dialog (focus trap)
- Keyboard navigation funzionante (Tab, Enter, Escape)
- Color contrast WCAG 2.1 AA (4.5:1 testo, 3:1 UI)
- `aria-label` su bottoni icon-only
- `role` e `aria-*` attributes su componenti custom interattivi

### Tailwind & Design System
- CSS variables per colori (no hardcoded hex/rgb)
- Varianti CVA per componenti con stati multipli
- Dark mode supportato e testato
- Spacing consistente (scale Tailwind: 1, 2, 3, 4, 6, 8...)
- Typography scale rispettata (font-geist-sans, font-geist-mono)
- `cn()` helper per merge condizionale di classi

### State Management
- Supabase Realtime per job status (`useJobStatus`)
- Cleanup subscription su unmount (return in useEffect)
- No state duplicato (single source of truth)
- Error boundaries per crash recovery
- Optimistic UI dove appropriato (upload progress)

### Auth & Tier Gating
- Middleware redirect per pagine protette
- Session refresh nel middleware (createServerClient)
- Free/Pro limits visibili nella UI prima dell'azione
- Upgrade CTA per feature Pro-only
- Nessun dato di altri utenti visibile (RLS frontend-aware)

### Performance
- `next/image` per immagini (lazy loading, sizing)
- No unnecessary re-renders (memo, useCallback dove serve)
- TUS upload con chunking 6MB
- Route-based code splitting (App Router default)
- Font preload (Geist)

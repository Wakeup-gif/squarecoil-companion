# Route Capability Matrix

**Audit date:** 2026-08-28
**Rule:** a route appearing here authorizes only the listed presentation/read-only capability. It never authorizes native control activation, value changes, form submission, or business-data mutation.

| Exact pathname / condition | Base themes | Bounded adapters | Optional data surface | Current disposition |
|---|---|---|---|---|
| `/dashboard.php` | Dark Glass, Light Glass, Refined Light | panels, tables, forms, modals | Companion summary and Design Dashboard profile only when the query is exactly one `show=2` | Accepted exact-route |
| `/project.php` | all three themes | project panels, forms, tables, modals; Edit/List/Duplicate action row | none | Accepted presentation |
| `/projects.php` | all three themes | tables, filters, pagination, overlays | none | Accepted presentation |
| `/project_milestones.php` | all three themes | tables, modals, Gantt; Edit/List/Duplicate action row | none | Accepted presentation |
| `/project_designs.php` | all three themes | tables, Dropzone, overlays, CKEditor chrome and same-origin document | none | Accepted presentation |
| `/project_tasks.php` | all three themes | panels, forms, tables, modals | none | Accepted presentation |
| `/project_documents.php` | all three themes | tables, Dropzone, overlays, CKEditor when present | none | Accepted presentation |
| `/project_site_photos.php` | all three themes | panels, Dropzone, overlays | none | Accepted presentation |
| `/leads.php` | all three themes | exact audited admin-form inputs/selects plus general panels/tables | none | Accepted presentation |
| `/shopping_list.php` | all three themes | tables, forms, horizontal containment | none | Accepted presentation |
| `/purchase_orders.php` | all three themes | tables, forms, Select2, modals | none | Accepted presentation |
| `/tracking.php` | all three themes | tables, forms, overlays | none | Accepted presentation |
| `/receiving.php` | all three themes | tables, forms, modals | none | Accepted presentation |
| `/schedule.php` | all three themes | forms, tables, Gantt | none | Accepted presentation |
| `/calendar.php` | all three themes | FullCalendar shell; event border colors remain native semantic evidence | none | Accepted presentation |
| `/vacation_calendar.php` | all three themes | calendar surfaces and forms | none | Accepted presentation |
| `/active_inventory.php` | all three themes | tables, filters, Select2, overlays | none | Accepted presentation |
| `/sign_criteria.php` | all three themes | panels, forms, tables, editor when present | none | Accepted presentation |
| `/branding.php` | all three themes | panels, forms, editor when present | none | Accepted presentation |
| `/report.php` | all three themes | tables, filters, print fallback | none | Accepted presentation |
| `/reports.php` | all three themes | tables, filters, print fallback | none | Accepted presentation |
| Any other exact pathname | base theme foundation only; route attribute is `GENERIC` | no vendor or editor document adapter | none | Fail-closed generic presentation |

## Global component rules

- The themed navbar uses an `SC` mark and `SquareCoil` wordmark. Native / Off restores the native header.
- User/help hover surfaces stay translucent and theme-appropriate; no hard white dark-theme hover is introduced.
- Nested panels never receive their own backdrop blur. Blur is limited to the outer shell/navigation/overlay surfaces that need it.
- Tables, forms, calendars, modals, overlays, Select2, DataTables, Dropzone, CKEditor, and Gantt keep native values, event colors, targets, handlers, disabled states, and order.
- Same-origin CKEditor discovery is bounded to four scans at `0`, `350`, `1000`, and `2400` ms. Cross-origin/inaccessible frames remain untouched.
- Reduced motion, forced colors, reduced transparency, narrow layout, and print have explicit fallbacks.

## Deferred route capabilities

Menu reordering, watched-job extraction, file/folder indicators, notification sourcing, path tools, scope workspace behavior, and Design Job actions have no route authorization in this matrix. They remain blocked, deferred, or rejected as recorded in `EXTENSION-NATIVE-MIGRATION-INVENTORY.md`.

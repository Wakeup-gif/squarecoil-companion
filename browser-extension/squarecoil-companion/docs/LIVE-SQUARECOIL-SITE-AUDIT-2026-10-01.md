# Read-only SquareCoil Website Structure Audit — October 1, 2026

This audit inspected the user's existing signed-in Chrome tab by navigation and read-only DOM/layout observation. No clock action, form submission, record edit, permission change, or extension installation occurred. The tab was returned to `/dashboard.php` afterward. Customer names, contacts, addresses, descriptions, and project records are intentionally omitted.

| Visible page | Actual route | Structural observations relevant to the theme |
|---|---|---|
| Home dashboard | `/dashboard.php` | `#main`, `#sidebar_left`, `#content_wrapper`, `#topbar`, `#content`; three `.widget-task.panel` cards. |
| Existing projects | `/projects.php?action=1` | Search form in a side panel, result table `#datatable1`, two `.panel` surfaces. Sidebar's link begins at `/search.php?action=3` and redirects. |
| Project overview | `/project.php?id=…` | 205px `#pmlt` tray beside `#customer-name` and `#customer-info`; project navigation in `#project_menu`; rich-text editor iframe in the content area. |
| Project Design | `/project_designs.php?id=…` | Same tray and customer header. Real Design cards are generic `.panel.panel-primary.panel-border.top` with `.panel-heading` and `.panel-body`; the page also uses nested `.panel` cards and a status `.alert`. `#projectbox` and `#designbox`, used by parts of the fictional lab, were absent. |
| Design Requests | `/dashboard.php?show=2` | Same dashboard shell plus `#inProgress`, `#nextJob`, and `#onHold` design-list containers. These lists are not tables. |
| Project Status | `/project_milestones.php?id=…` | Same project tray; 13 tables and multiple forms/modals. Borders here can convey row/status separation and need targeted treatment. |
| Project Tasks | `/project_tasks.php?id=…` | Same project tray; `#tasksTable`, three panels, and a search control. |
| Install Calendar | `/calendar.php` | Body enters collapsed-sidebar mode; `#calendar` is FullCalendar with many tables. Calendar grid and event meaning must be preserved. |
| Leads | `/leads.php?action=1` | Sidebar link begins at `/search.php?action=5` and redirects; search form, export control, result table `#datatable`. |

At the inspected 1920×959 viewport, the native project layout had a 230px global sidebar, a 205px project tray, and a flexible content area. The actual Design page's `#customer-info` was a `.panel.col-xs-12.no-gutter`; the important design wrappers were generic panels without stable IDs. Theme tests should therefore use these real selector shapes and verify both Glass variants, box shadows, backdrop blur, status fills, focus rings, and calendar grids. The user's supplied screenshot documents the narrower Glass layout, but no theme was installed or toggled in the live browser during this read-only audit.

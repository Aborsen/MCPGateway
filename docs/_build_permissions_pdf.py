# Builds docs/permissions-concept.pdf — Ukrainian-language permissions
# concept document modeled on the structure of the reference PDF but
# describing the MCP Gateway's actual implementation.
#
# Run: python docs/_build_permissions_pdf.py

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# ── Fonts: Arial supports Cyrillic on Windows ───────────────────────────
pdfmetrics.registerFont(TTFont("Body", "C:/Windows/Fonts/arial.ttf"))
pdfmetrics.registerFont(TTFont("Body-Bold", "C:/Windows/Fonts/arialbd.ttf"))
pdfmetrics.registerFont(TTFont("Body-Italic", "C:/Windows/Fonts/ariali.ttf"))
pdfmetrics.registerFont(TTFont("Mono", "C:/Windows/Fonts/consola.ttf"))

# ── Styles ──────────────────────────────────────────────────────────────
ss = getSampleStyleSheet()
H1 = ParagraphStyle(
    "H1",
    parent=ss["Heading1"],
    fontName="Body-Bold",
    fontSize=22,
    leading=26,
    spaceBefore=4,
    spaceAfter=10,
    textColor=colors.HexColor("#111111"),
)
H2 = ParagraphStyle(
    "H2",
    parent=ss["Heading2"],
    fontName="Body-Bold",
    fontSize=15,
    leading=19,
    spaceBefore=14,
    spaceAfter=6,
    textColor=colors.HexColor("#1a1a1a"),
)
H3 = ParagraphStyle(
    "H3",
    parent=ss["Heading3"],
    fontName="Body-Bold",
    fontSize=12,
    leading=16,
    spaceBefore=8,
    spaceAfter=4,
    textColor=colors.HexColor("#1a1a1a"),
)
P = ParagraphStyle(
    "P",
    parent=ss["BodyText"],
    fontName="Body",
    fontSize=10,
    leading=14,
    spaceAfter=6,
    alignment=TA_LEFT,
)
P_NOTE = ParagraphStyle(
    "Note",
    parent=P,
    fontName="Body-Italic",
    textColor=colors.HexColor("#555555"),
    leftIndent=10,
    borderPadding=4,
)
P_BULLET = ParagraphStyle(
    "Bullet", parent=P, leftIndent=14, bulletIndent=2, spaceAfter=2
)
CODE = ParagraphStyle(
    "Code",
    parent=P,
    fontName="Mono",
    fontSize=9,
    leading=12,
    leftIndent=10,
    spaceAfter=8,
    textColor=colors.HexColor("#222222"),
    backColor=colors.HexColor("#f4f4f4"),
    borderPadding=6,
)


def p(text):
    return Paragraph(text, P)


def b(text):
    """Bulleted paragraph."""
    return Paragraph(f"• {text}", P_BULLET)


def h1(text):
    return Paragraph(text, H1)


def h2(text):
    return Paragraph(text, H2)


def h3(text):
    return Paragraph(text, H3)


def note(text):
    return Paragraph(f"<i>{text}</i>", P_NOTE)


def code(text):
    return Paragraph(text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"), CODE)


def make_table(rows, col_widths=None):
    tbl = Table(rows, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Body"),
                ("FONTNAME", (0, 0), (-1, 0), "Body-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("LEADING", (0, 0), (-1, -1), 12),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8e8e8")),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#fafafa")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#bbbbbb")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return tbl


# Wrap any cell text in a Paragraph so it wraps inside the table cell.
def cell(text):
    return Paragraph(text, P)


def cellb(text):
    return Paragraph(f"<b>{text}</b>", P)


# ── Document content ────────────────────────────────────────────────────
story = []

story.append(h1("Концепція прав доступу — MCP Gateway"))

# ── Overview ────────────────────────────────────────────────────────────
story.append(h2("Огляд"))
story.append(
    p(
        "Система управління правами доступу побудована на двох незалежних рівнях."
    )
)
story.append(
    p(
        "<b>Platform Permissions</b> визначають, що користувач може робити в "
        "адміністративному інтерфейсі: керувати з’єднаннями (connections), "
        "користувачами, робочими просторами (workspaces), переглядати журнал "
        "аудиту тощо. Доступ контролюється каталогом із 32 дозволів, об’єднаних "
        "у 8 системних та довільну кількість користувацьких ролей."
    )
)
story.append(
    p(
        "<b>Data Permissions</b> визначають, до яких джерел даних та з якими "
        "SQL-операціями користувач може звертатися через MCP-проксі. Доступ "
        "надається через членство в робочому просторі (<font name='Mono'>WorkspaceUser</font>) "
        "або через прямий грант (<font name='Mono'>UserDataSourceAccess</font>). Усередині "
        "кожного джерела можна обмежити доступ до списку дозволених таблиць "
        "(<font name='Mono'>allowedTables</font>) або застосувати постійний блок-список "
        "на рівні з’єднання (<font name='Mono'>blockedTables</font>)."
    )
)
story.append(
    p(
        "Користувача можна тимчасово деактивувати без видалення "
        "(<font name='Mono'>User.suspendedAt</font>) — це негайно блокує вхід в "
        "адміністративний інтерфейс та використання MCP-ендпоінту. Усі ролі та "
        "грантовані права при цьому зберігаються."
    )
)
story.append(h3("Ідентифікація користувачів"))
story.append(
    b(
        "<b>Адмін-інтерфейс</b> — внутрішня credentials-аутентифікація через Auth.js v5 "
        "(email + bcrypt-хеш пароля), JWT-сесія, що містить лише <font name='Mono'>user.id</font>."
    )
)
story.append(
    b(
        "<b>MCP-клієнти</b> — OAuth 2.1 PKCE через вбудований OIDC-провайдер "
        "(<font name='Mono'>oidc-provider</font>); опаковані access-токени з валідацією через DB, "
        "TTL 1 година, ротовані refresh-токени."
    )
)
story.append(
    p(
        "Роль <b>owner</b> має повний набір 32 дозволів і захищена від видалення/перевизначення "
        "через спеціальні інваріанти на боці серверних маршрутів (видалення Owner-користувача "
        "та призначення Owner-ролі залишаються Owner-only)."
    )
)
story.append(
    note(
        "Примітка: цей документ описує реалізацію станом на поточний момент. UI ілюструється "
        "посиланнями на конкретні файли в репозиторії; скріншоти не додаються — фронтенд "
        "продовжує змінюватися."
    )
)

# ── User List ───────────────────────────────────────────────────────────
story.append(h2("Список користувачів"))
story.append(
    p(
        "Список усіх користувачів доступний за пунктом меню <b>Users</b> "
        "(<font name='Mono'>/users</font>). Сторінка показує:"
    )
)
story.append(b("Аватар та ім’я"))
story.append(b("Email"))
story.append(
    b(
        "Основну системну роль (badge біля імені) та <font name='Mono'>+N</font> чіп, якщо "
        "у користувача декілька ролей (з тултіпом-переліком кожної)"
    )
)
story.append(
    b(
        "MCP Status — індикатор того, чи має користувач активний неперекритий OAuth-токен "
        "(доказ того, що MCP-клієнт під’єднаний)"
    )
)
story.append(b("Kebab-меню «Quick actions» для зміни ролі, призупинення тощо"))
story.append(
    p(
        "Доступні: сортування за колонками, пошук за іменем/email, фільтрація за роллю "
        "(включно з користувацькими), експорт у CSV, групові операції — bulk role assignment "
        "(системні ролі замінюють основну, користувацькі стекаються) та bulk delete."
    )
)

# ── Edit User ───────────────────────────────────────────────────────────
story.append(h2("Редагування користувача"))
story.append(
    p(
        "Сторінка <font name='Mono'>/users/[id]</font> побудована як набір карток у "
        "двоколонковій сітці. Поточний порядок (зверху донизу):"
    )
)
story.append(h3("Рядок 1 — Account / User Info"))
story.append(
    b(
        "<b>Account</b>: email, дата створення, прапорець suspended, MCP-URL з кнопкою "
        "копіювання. Owner-only: кнопки скидання пароля та призупинення."
    )
)
story.append(
    b(
        "<b>User Info</b>: метрики за останній час — кількість запитів за 24 години / 7 днів, "
        "% помилок, last active, last sign-in, топ-5 викликаних tools."
    )
)
story.append(h3("Рядок 2 — Assigned Roles / Permission Overrides"))
story.append(
    b(
        "<b>Assigned Roles</b>: усі <font name='Mono'>UserRole</font>-присвоєння (глобальні та "
        "workspace-scoped) із джерелом гранту та датою; кнопки додати/видалити роль. "
        "Owner-роль призначається лише іншим Owner."
    )
)
story.append(
    b(
        "<b>Permission Overrides</b>: усі <font name='Mono'>UserPermissionOverride</font>-рядки "
        "(GRANT або REVOKE окремого дозволу) з обов’язковим полем <font name='Mono'>reason</font> "
        "та опційним терміном дії <font name='Mono'>expiresAt</font>."
    )
)
story.append(h3("Рядок 3 — Workspaces / Connections"))
story.append(
    b(
        "<b>Workspaces</b>: список усіх <font name='Mono'>WorkspaceUser</font>-членств із "
        "бейджами рівнів доступу (View / Edit / Delete) і hover-кнопкою видалення."
    )
)
story.append(
    b(
        "<b>Connections</b>: дедуплікований список усіх з’єднань, до яких користувач має доступ "
        "— через будь-яке членство в робочому просторі АБО прямий грант. Кожне джерело показує "
        "походження (<font name='Mono'>«via Engineering · Edit», «direct grant · View»</font>)."
    )
)
story.append(h3("Рядок 4 — Effective Permissions"))
story.append(
    p(
        "Розгорнутий перелік усіх 32 дозволів каталогу з відмітками «має / не має» та поясненням "
        "джерела гранту (роль X / override / зі workspace Y). Картка займає всю ширину."
    )
)

story.append(PageBreak())

# ── Platform Permissions ────────────────────────────────────────────────
story.append(h2("Platform Permissions"))
story.append(
    p(
        "Платформенні права визначають, що користувач може робити в адміністративному "
        "інтерфейсі. Реалізовано через каталогічну RBAC-систему."
    )
)

story.append(h3("Каталог дозволів"))
story.append(
    p(
        "Джерелом істини є файл <font name='Mono'>lib/permissions/catalog.ts</font>. Містить "
        "<b>32 дозволи</b>, об’єднаних у 7 категорій:"
    )
)

cat_rows = [
    [cellb("Категорія"), cellb("Приклади ключів")],
    [
        cell("dashboard"),
        cell("<font name='Mono'>dashboard.view</font>"),
    ],
    [
        cell("connections"),
        cell(
            "<font name='Mono'>connections.view, .create, .update, .delete, "
            ".manage_credentials, .manage_tools</font>"
        ),
    ],
    [
        cell("users"),
        cell(
            "<font name='Mono'>users.view, .create, .update, .change_role, "
            ".suspend, .delete, .reset_password</font>"
        ),
    ],
    [
        cell("workspaces"),
        cell(
            "<font name='Mono'>workspaces.view, .create, .update, .delete, "
            ".manage_members, .manage_data_sources, .manage_data_permissions</font>"
        ),
    ],
    [
        cell("permissions"),
        cell(
            "<font name='Mono'>permissions.view, .manage_roles, "
            ".manage_assignments, .manage_overrides</font>"
        ),
    ],
    [
        cell("audit"),
        cell(
            "<font name='Mono'>audit.view_own, .view_all, .view_admin_events, .export</font>"
        ),
    ],
    [
        cell("settings"),
        cell("<font name='Mono'>settings.view, .manage_system</font>"),
    ],
]
story.append(make_table(cat_rows, col_widths=[3.2 * cm, 13.5 * cm]))
story.append(Spacer(1, 4))
story.append(
    p(
        "Кожен дозвіл має прапорець <font name='Mono'>scopeable</font> — "
        "<font name='Mono'>true</font> означає, що грант можна обмежити конкретним робочим "
        "простором (більшість <font name='Mono'>workspaces.*</font> дозволів)."
    )
)

story.append(h3("Системні ролі"))
story.append(
    p(
        "Зашиті 8 ролей (<font name='Mono'>isSystem=true</font>) синхронізуються при кожному "
        "деплої через <font name='Mono'>tsx lib/permissions/seed.ts</font>:"
    )
)
role_rows = [
    [cellb("Slug"), cellb("Опис")],
    [
        cell("<font name='Mono'>owner</font>"),
        cell(
            "Усі 32 дозволи. Owner-only інваріанти: видалення Owner-користувача, "
            "призначення Owner-ролі."
        ),
    ],
    [
        cell("<font name='Mono'>admin</font>"),
        cell(
            "Усі 32 дозволи. Може створювати/редагувати/видаляти користувачів та "
            "користувацькі ролі. Не може видалити Owner або призначити Owner-роль."
        ),
    ],
    [
        cell("<font name='Mono'>editor</font>"),
        cell(
            "dashboard + повний connections + audit.view_all + settings.view. "
            "Менеджер з’єднань."
        ),
    ],
    [
        cell("<font name='Mono'>staff</font>"),
        cell("dashboard + workspaces.view + settings.view. Тільки читання."),
    ],
    [
        cell("<font name='Mono'>guest</font>"),
        cell("dashboard + connections.view + workspaces.view + settings.view."),
    ],
    [
        cell("<font name='Mono'>user</font>"),
        cell(
            "Порожній набір. Тільки MCP-клієнт, доступу до адмін-панелі немає. "
            "Дефолт для нових облікових записів."
        ),
    ],
    [
        cell("<font name='Mono'>workspace_admin</font>"),
        cell(
            "Workspace-scoped: керування членами, з’єднаннями та правами на дані. "
            "Призначається через ненульовий <font name='Mono'>UserRole.workspaceId</font>."
        ),
    ],
    [
        cell("<font name='Mono'>workspace_member</font>"),
        cell("dashboard + workspaces.view + settings.view. Тільки для scope-присвоєнь."),
    ],
]
story.append(make_table(role_rows, col_widths=[4 * cm, 12.7 * cm]))

story.append(h3("Користувацькі ролі"))
story.append(
    p(
        "Адміністратор з дозволом <font name='Mono'>permissions.manage_roles</font> може "
        "створювати власні ролі на сторінці <font name='Mono'>/permissions/roles</font>. "
        "Користувацькі ролі (<font name='Mono'>isSystem=false</font>) — це довільні комбінації "
        "дозволів каталогу. Системні ролі через UI не редагуються."
    )
)

story.append(h3("Per-User Overrides"))
story.append(
    p(
        "На додачу до ролей кожному користувачу можна задати індивідуальний "
        "<font name='Mono'>UserPermissionOverride</font> — <b>GRANT</b> (додає окремий дозвіл) "
        "або <b>REVOKE</b> (відбирає дозвіл, який давала б роль). Обов’язкове поле "
        "<font name='Mono'>reason</font> (для аудиту), опційний "
        "<font name='Mono'>expiresAt</font>. Очищення прострочених override-ів виконує денний "
        "крон <font name='Mono'>/api/cron/expire-overrides</font>."
    )
)

story.append(h3("Перевірка дозволів"))
story.append(
    p(
        "Усі API-маршрути та сторінки використовують helpers з <font name='Mono'>lib/auth.ts</font>:"
    )
)
story.append(
    b(
        "<font name='Mono'>requirePermission(key)</font> — повертає сесію або 401/403."
    )
)
story.append(
    b(
        "<font name='Mono'>requirePermissionInWorkspace(key, workspaceId)</font> — те саме, але "
        "вимагає, щоб грант поширювався на конкретний робочий простір."
    )
)
story.append(
    b(
        "<font name='Mono'>gatePermission(key)</font> — варіант для server-component pages "
        "(редірект замість JSON-відповіді)."
    )
)
story.append(
    p(
        "Резолвер <font name='Mono'>lib/permissions/resolve.ts</font> обчислює ефективні права з "
        "<font name='Mono'>UserRole + RolePermission + UserPermissionOverride</font> і кешується "
        "через <font name='Mono'>React.cache()</font> на час одного запиту."
    )
)

story.append(PageBreak())

# ── Data Permissions — View ─────────────────────────────────────────────
story.append(h2("Data Permissions — Перегляд"))
story.append(
    p(
        "Ефективний доступ користувача до даних обчислюється як <b>об’єднання</b> усіх "
        "джерел грантів:"
    )
)
story.append(
    code(
        "Effective Access = ⋃ (WorkspaceUser → WorkspaceDataSource) "
        "∪ ⋃ (UserDataSourceAccess)"
    )
)
story.append(p("Для кожного з’єднання обчислюються:"))
story.append(
    b(
        "<b>permissions</b> — об’єднання SQL-рівнів зі всіх джерел "
        "(відображається як View / Edit / Delete)."
    )
)
story.append(
    b(
        "<b>allowedTables</b> — об’єднання списків (якщо хоч одне джерело дає "
        "<font name='Mono'>null</font> — доступ до всіх таблиць)."
    )
)
story.append(
    b(
        "<b>sources</b> — мітковий список джерел гранту: адміністратор бачить, "
        "через який саме шлях користувач отримав доступ."
    )
)

story.append(h3("Картка Connections на сторінці користувача"))
story.append(
    p(
        "Дедуплікований список з’єднань, доступних користувачу. Кожен рядок показує:"
    )
)
story.append(b("Назву з’єднання та тип."))
story.append(
    b(
        "Усі джерела гранту з провенансом "
        "(<font name='Mono'>«via Engineering · Edit», «direct grant · View»</font>)."
    )
)

story.append(h3("Permissions Matrix (/permissions)"))
story.append(p("Триставкова сторінка:"))
story.append(
    b(
        "<b>By User</b> — лівий стовпчик зі списком користувачів, правий — список усіх "
        "з’єднань для вибраного користувача."
    )
)
story.append(
    b(
        "<b>By Connection</b> — інверсний вид: лівий стовпчик з’єднань, правий — усі "
        "користувачі для вибраного з’єднання."
    )
)
story.append(
    b(
        "<b>Matrix</b> — щільна таблиця «користувачі × з’єднання» з міні-бейджами "
        "V/E/D у кожній клітинці."
    )
)
story.append(p("У всіх вкладках:"))
story.append(b("Direct-grant клітинки помічаються іконкою Sparkles."))
story.append(
    b(
        "Workspace-походження показується через bg-secondary бейджі "
        "(<font name='Mono'>«Sales · View · Edit»</font>)."
    )
)
story.append(
    b(
        "Інлайн-індикатори таблично-рівневого обмеження не виводяться у списку Workspaces "
        "сторінки з’єднання (керування таблицями ведеться у workspace editor)."
    )
)

# ── Data Permissions — Edit ─────────────────────────────────────────────
story.append(h2("Data Permissions — Редагування"))

story.append(h3("Спрощення SQL-рівнів у UI"))
story.append(
    p(
        "Хранилище зберігає рідну 5-рівневу модель (<font name='Mono'>select | insert | update | "
        "delete | execute</font>), але адміністративний інтерфейс групує їх у три зрозумілі ярлики:"
    )
)
level_rows = [
    [cellb("UI-ярлик"), cellb("Базові SQL-рівні")],
    [cellb("View"), cell("<font name='Mono'>select</font>")],
    [
        cellb("Edit"),
        cell(
            "<font name='Mono'>insert</font> ∪ <font name='Mono'>update</font> "
            "∪ <font name='Mono'>execute</font>  (перемикаються разом)"
        ),
    ],
    [cellb("Delete"), cell("<font name='Mono'>delete</font>")],
]
story.append(make_table(level_rows, col_widths=[3 * cm, 13.7 * cm]))
story.append(Spacer(1, 4))
story.append(
    p(
        "MCP-проксі робить перевірку через set-membership "
        "(<font name='Mono'>connector.permissions.has(required)</font>) — для нього "
        "<font name='Mono'>insert</font>/<font name='Mono'>update</font>/<font name='Mono'>execute</font> "
        "функціонально однакові, тому об’єднання їх в один Edit-бакет нічого не ламає. "
        "При збереженні з UI обирається канонічний представник "
        "(<font name='Mono'>update</font> для Edit). Хелпери — "
        "<font name='Mono'>effectiveLevelsFor()</font>, <font name='Mono'>expandEffectiveSet()</font> "
        "у <font name='Mono'>app/(dashboard)/permissions/permissions-types.ts</font>."
    )
)

story.append(h3("Workspace Editor (/workspaces/[id])"))
story.append(
    p(
        "Робочий простір — основний механізм надання доступу великим групам користувачів. "
        "У редакторі:"
    )
)
story.append(b("<b>Details</b>: ім’я, опис."))
story.append(
    b(
        "<b>Data Sources</b>: вибір з’єднань, прикріплених до робочого простору; для кожного "
        "— опційний <font name='Mono'>allowedTables</font> (список дозволених таблиць; "
        "<font name='Mono'>null</font> = усі)."
    )
)
story.append(
    b(
        "<b>Users</b>: список членів робочого простору з трьома чекбоксами per-member "
        "(View / Edit / Delete). Ці права застосовуються до <b>всіх</b> з’єднань робочого "
        "простору однаково, оскільки <font name='Mono'>WorkspaceUser.permissions</font> — це "
        "per-membership, не per-connector."
    )
)

story.append(h3("Direct Grants (Permissions Matrix → By User)"))
story.append(
    p(
        "Інлайн-редагування прямих грантів виконується прямо в матриці. У ряді кожного "
        "з’єднання — три pill-кнопки (View / Edit / Delete), які:"
    )
)
story.append(b("Активні (primary tint) — якщо є прямий грант на цей рівень."))
story.append(
    b(
        "Зелені — якщо рівень доступний через робочий простір (read-only показ; "
        "клік додає прямий грант)."
    )
)
story.append(
    b(
        "Підсвічені — якщо рівень походить лише з workspace і доступне редагування "
        "через діалог."
    )
)
story.append(
    p(
        "Workspace-походження клітинки показується як клікабельний чіп. Клік відкриває "
        "діалог «Edit X workspace permissions for Y» з амбер-попередженням, що зміна вплине "
        "на <b>усі</b> з’єднання робочого простору. Той самий діалог можна відкрити, клікнувши "
        "на затьмарену SQL-pill — корисно, коли користувач має лише workspace-доступ і хоче "
        "змінити перміс на одному кроці."
    )
)

story.append(h3("Bulk операції"))
story.append(
    p(
        "Виділення 2+ користувачів (або 2+ з’єднань) у списку відкриває <b>BulkBar</b> на правій "
        "панелі. Адміністратор обирає одного контрагента (з’єднання — для bulk-користувачів, "
        "або користувача — для bulk-з’єднань), три рівні (View / Edit / Delete) і натискає "
        "<b>Grant direct access</b> (масовий PUT) або <b>Revoke direct grants</b> (масовий DELETE). "
        "Bulk торкається лише прямих грантів — workspace-членства не змінюються."
    )
)

story.append(PageBreak())

# ── Table-Level Allowlist / Blocklist ──────────────────────────────────
story.append(h2("Table-Level Allowlist та Blocklist"))
story.append(
    p(
        "У відмінність від реляційних БД, де можна задавати WHERE-умови, MCP Gateway працює на "
        "рівні MCP-tools. Обмеження доступу здійснюється трьома рівнями:"
    )
)
story.append(
    p(
        "<b>1. <font name='Mono'>DataSource.blockedTables</font></b> — постійний deny-list на рівні "
        "з’єднання. Будь-який tool call, що націлений на таблицю з цього списку, відхиляється — "
        "незалежно від workspace/direct гранту. Редагується через кнопку <b>Block tables</b> на "
        "сторінці з’єднання. Це «вічно заборонені таблиці» власника з’єднання."
    )
)
story.append(
    p(
        "<b>2. Workspace-level <font name='Mono'>allowedTables</font></b> "
        "(<font name='Mono'>WorkspaceDataSource.allowedTables</font>) — обмеження для всіх членів "
        "робочого простору на конкретному з’єднанні. <font name='Mono'>null</font> = усі таблиці; "
        "не-null = лише перелічені."
    )
)
story.append(
    p(
        "<b>3. Direct-grant <font name='Mono'>allowedTables</font></b> "
        "(<font name='Mono'>UserDataSourceAccess.allowedTables</font>) — обмеження для конкретного "
        "користувача на прямий грант. Та сама семантика."
    )
)

story.append(h3("Алгоритм застосування"))
story.append(
    b(
        "<b>На <font name='Mono'>tools/list</font></b>: якщо для з’єднання задано "
        "<font name='Mono'>allowedTables</font>, видаляються «raw query» tools (інструменти типу "
        "<font name='Mono'>query</font>, <font name='Mono'>run_soql</font>, "
        "<font name='Mono'>execute_ddl</font>), оскільки SQL-сирий запит не можна обмежити таблично."
    )
)
story.append(
    b(
        "<b>На <font name='Mono'>tools/call</font></b>: аргументи tool-виклику скануються на ключі "
        "<font name='Mono'>table_name</font>, <font name='Mono'>table</font>, "
        "<font name='Mono'>module</font>, <font name='Mono'>object_name</font>, "
        "<font name='Mono'>objectName</font>, <font name='Mono'>resource</font>. Якщо знайдено "
        "таблицю поза <font name='Mono'>allowedTables</font> або в "
        "<font name='Mono'>blockedTables</font> — виклик відхиляється до того, як буде звернення "
        "до апстріму (PERMISSION_DENIED)."
    )
)
story.append(
    b(
        "<b>Пост-фільтр відповіді</b>: відповіді на list-tools (наприклад, "
        "<font name='Mono'>list_tables</font>) проганяються через "
        "<font name='Mono'>filterListedTablesText()</font>, який вилучає згадки заборонених таблиць."
    )
)
story.append(
    note(
        "Row-Level Security не реалізовано на боці шлюзу. Якщо потрібно фільтрувати рядки за "
        "умовою (наприклад, REGION = 'EU'), це покладається на upstream MCP-сервер."
    )
)

# ── Workspace Permissions ───────────────────────────────────────────────
story.append(h2("Workspace Permissions"))
story.append(
    p(
        "Робочий простір — основний механізм групування користувачів та з’єднань. Кожен "
        "член отримує одні й ті ж SQL-рівні (View / Edit / Delete) на всі з’єднання робочого "
        "простору. Workspaces дозволяють делегувати адміністрування секцією організації."
    )
)

story.append(h3("Сторінка /workspaces"))
story.append(
    p(
        "Список робочих просторів. Глобальний адміністратор бачить усі workspaces; адміністратор, "
        "обмежений scope (через <font name='Mono'>UserRole.workspaceId</font>), бачить лише ті, "
        "до яких має доступ."
    )
)

story.append(h3("Workspace-scoped адміністратори"))
story.append(
    p(
        "<font name='Mono'>UserRole</font>-рядок з ненульовим "
        "<font name='Mono'>workspaceId</font> дає правам ролі застосовуватися лише в межах "
        "конкретного робочого простору. Наприклад:"
    )
)
story.append(
    b(
        "<b>Alice</b> має <font name='Mono'>workspace_admin</font> з "
        "<font name='Mono'>workspaceId = «sales»</font> — вона може керувати членами та правами в "
        "«Sales», але не в «Engineering»."
    )
)
story.append(
    b(
        "<b>Bob</b> має <font name='Mono'>admin</font> без scope — глобальний адміністратор."
    )
)
story.append(
    p(
        "Резолвер <font name='Mono'>canInWorkspace(userId, key, wsId)</font> коректно обробляє "
        "обидва випадки."
    )
)

story.append(h3("Workspace MCP URL"))
story.append(
    p(
        "Кожен робочий простір має власний <font name='Mono'>mcpUid</font> — випадковий "
        "24-байтовий base64url-рядок. URL виду "
        "<font name='Mono'>https://gateway/api/mcp/w/{mcpUid}</font> подає лише дані цього "
        "робочого простору для members, які пройшли OAuth. Прямі гранти не входять у "
        "workspace-scoped доступ — це навмисно, щоб робочий простір залишався чистим "
        "scope-обмеженим джерелом."
    )
)
story.append(
    p(
        "Окрім workspace-scoped URL, є <b><font name='Mono'>/api/mcp</font></b> (generic) — один "
        "URL для всіх користувачів, який віддає об’єднання всіх workspace-членств і прямих "
        "грантів. OAuth-обліковий запис є authoritative — <font name='Mono'>uid</font> у URL "
        "більше не використовується."
    )
)

story.append(h3("Per-Member Permission Inline Edit"))
story.append(
    p(
        "На сторінці <font name='Mono'>/permissions</font> (вкладки <b>By User</b> та "
        "<b>By Connection</b>) workspace-source чіпи клікабельні. Клік відкриває діалог "
        "редагування рівнів членства з амбер-попередженням, що зміна вплине на <b>усі</b> "
        "з’єднання робочого простору. PUT-запит йде на "
        "<font name='Mono'>/api/workspaces/{id}/users/{userId}</font> (gated на "
        "<font name='Mono'>workspaces.manage_data_permissions</font>). Збереження порожнього "
        "списку рівнів видаляє членство повністю "
        "(<font name='Mono'>WORKSPACE_USER_REMOVED</font> audit event)."
    )
)

# ── Footer ──────────────────────────────────────────────────────────────
story.append(Spacer(1, 18))
story.append(
    note(
        "Кінець документа. Для технічних деталей реалізації див. SPECIFICATIONS.md та коментарі "
        "у lib/permissions/, lib/auth.ts, app/api/mcp/."
    )
)

# ── Build ───────────────────────────────────────────────────────────────
out_path = Path("D:/AI Connecitivty/docs/permissions-concept.pdf")
out_path.parent.mkdir(parents=True, exist_ok=True)

doc = SimpleDocTemplate(
    str(out_path),
    pagesize=A4,
    leftMargin=2 * cm,
    rightMargin=2 * cm,
    topMargin=1.8 * cm,
    bottomMargin=1.8 * cm,
    title="Концепція прав доступу — MCP Gateway",
    author="MCP Gateway",
)
doc.build(story)
print(f"OK — wrote {out_path} ({out_path.stat().st_size} bytes)")

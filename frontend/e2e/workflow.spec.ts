import { test, expect, type Page } from "@playwright/test";

async function login(
  page: Page,
  role: "school" | "university",
  email?: string,
  password = "VectorDemo2026!",
) {
  await page.goto("/");
  await page
    .getByRole("button", {
      name: role === "school" ? "Менеджер ИТ-школы" : "Менеджер вуза",
      exact: false,
    })
    .click();
  await page
    .getByLabel("Email", { exact: true })
    .fill(email || `${role}@demo.test`);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Добрый день/ }),
  ).toBeVisible();
}
async function dialogSave(page: Page, name = "Сохранить") {
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function changeStage(page: Page, value: string) {
  await page
    .getByRole("button", { name: "Изменить этап", exact: false })
    .click();
  await page.getByLabel("Новый этап").selectOption(value);
  await dialogSave(page);
}

test("two entrances and reserved roles", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /Менеджер ИТ-школы/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Менеджер вуза/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/login-1440.png",
    fullPage: true,
  });
  await page.goto("/admin");
  await expect(
    page.getByText("Этот кабинет появится", { exact: false }),
  ).toBeVisible();
  await page.goto("/government");
  await expect(
    page.getByRole("heading", { name: "Сотрудник органов" }),
  ).toBeVisible();
});

test("school dashboard, directories, report, responsive layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "school");
  await page.screenshot({
    path: "test-results/dashboard-1440.png",
    fullPage: true,
  });
  for (const route of [
    "/universities",
    "/deals",
    "/tasks",
    "/programs",
    "/reports",
    "/integrations",
  ]) {
    await page.goto(route);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  await page.goto("/deals");
  await expect(page.locator(".deal-card").first()).toBeVisible();
  await page.screenshot({
    path: "test-results/kanban-1440.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: /Добрый день/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-768.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});

test("university privacy and results", async ({ page }) => {
  await login(page, "university");
  await expect(
    page.getByRole("link", { name: "Отчёты", exact: true }),
  ).toHaveCount(0);
  await page.goto("/deals/3");
  await expect(
    page.getByText("Внутренние заметки", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Группы и обучение", exact: false })
    .click();
  await page.getByRole("button", { name: "Участники и результаты" }).click();
  await expect(
    page.getByRole("dialog").getByText("Состав заблокирован"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Добавить", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/university-group.png",
    fullPage: true,
  });
});

test("full partnership cycle through both interfaces including invitation", async ({
  browser,
  request,
}) => {
  const schoolContext = await browser.newContext(),
    uniContext = await browser.newContext();
  const school = await schoolContext.newPage(),
    uni = await uniContext.newPage();
  const tag = Date.now(),
    email = `invited-${tag}@example.test`,
    password = "E2eSecurePassword!";
  await login(school, "school");
  await school.goto("/universities");
  await school
    .getByRole("button", { name: "Добавить вуз", exact: true })
    .click();
  await school
    .getByLabel("Название университета")
    .fill("Тестовый университет " + tag);
  await school.getByLabel("Регион", { exact: true }).last().fill("Москва");
  await school.getByLabel("Профиль", { exact: true }).last().fill("ИТ");
  await dialogSave(school);
  await school
    .getByRole("button", { name: "Тестовый университет " + tag, exact: true })
    .click();
  await school.getByRole("button", { name: "Пригласить менеджера" }).click();
  await school.getByLabel("Email представителя").fill(email);
  await school
    .getByRole("button", { name: "Отправить приглашение", exact: true })
    .click();
  await expect(school.getByLabel("Email представителя")).toHaveCount(0);
  let token = "";
  await expect
    .poll(
      async () => {
        const response = await request.get(
          "http://localhost:8025/api/v1/messages",
        );
        const inbox = await response.json();
        const found = inbox.messages?.find(
          (m: { To: Array<{ Address: string }> }) =>
            m.To?.some((t) => t.Address === email),
        );
        if (!found) return false;
        const message = await (
          await request.get("http://localhost:8025/api/v1/message/" + found.ID)
        ).json();
        token = String(message.Text).match(/token=([^\s]+)/)?.[1] || "";
        return !!token;
      },
      { timeout: 20000 },
    )
    .toBeTruthy();
  await uni.goto("/accept?token=" + token);
  await uni.getByLabel("Ваше имя").fill("Новый Представитель");
  await uni.getByLabel("Новый пароль").fill(password);
  await uni.getByRole("button", { name: "Сохранить пароль" }).click();
  await expect(
    uni.getByText("Пароль сохранён.", { exact: false }),
  ).toBeVisible();
  await login(uni, "university", email, password);

  await school.goto("/deals");
  await school.getByRole("button", { name: "Новое сотрудничество" }).click();
  await school
    .getByLabel("Название сотрудничества")
    .fill("Сквозной сценарий " + tag);
  await school
    .getByLabel("Университет", { exact: true })
    .selectOption({ label: "Тестовый университет " + tag });
  await dialogSave(school);
  const dealPath = new URL(school.url()).pathname;
  await school.getByRole("button", { name: "Изменить", exact: true }).click();
  await school
    .getByLabel("Ответственное лицо / ЛПР")
    .fill("Представитель вуза");
  await school.getByLabel("Потребность и интерес").fill("Практические навыки");
  await school.getByLabel("Бюджет и условия").fill("Согласован");
  await school.getByLabel("Окно в учебном плане").fill("Осенний семестр");
  await dialogSave(school);
  await changeStage(school, "qualification");
  await changeStage(school, "approval");
  await school
    .getByRole("button", { name: "Программа и согласование", exact: true })
    .click();
  await school.getByRole("button", { name: "Новая версия" }).click();
  await school
    .getByLabel("Содержание программы, компетенции и инструменты")
    .fill("Практическая программа: 72 часа, анализ данных, итоговый проект.");
  await dialogSave(school, "Опубликовать для согласования");
  await uni.goto(dealPath);
  await uni
    .getByRole("button", { name: "Программа и согласование", exact: true })
    .click();
  await uni.getByRole("button", { name: "Отправить замечания" }).click();
  await uni
    .getByLabel("Комментарий", { exact: true })
    .fill("Добавьте командную практику");
  await dialogSave(uni);
  await school.reload();
  await school
    .getByRole("button", { name: "Программа и согласование", exact: true })
    .click();
  await school.getByRole("button", { name: "Новая версия" }).click();
  await school
    .getByLabel("Содержание программы, компетенции и инструменты")
    .fill("72 часа, анализ данных и командная практика. Итоговый проект.");
  await dialogSave(school, "Опубликовать для согласования");
  await uni.reload();
  await uni
    .getByRole("button", { name: "Программа и согласование", exact: true })
    .click();
  await uni.getByRole("button", { name: "Согласовать", exact: true }).click();
  await expect(uni.getByText("Изменения сохранены")).toBeVisible();
  await expect(
    uni.getByRole("button", { name: "Согласовать", exact: true }),
  ).toHaveCount(0);
  await expect(
    uni.getByText(
      "Программа согласована и передана дальше по цепочке сотрудничества.",
    ),
  ).toBeVisible();
  await school.reload();
  await expect(school.locator(".deal-meta-bar .badge-contract")).toBeVisible();
  await changeStage(school, "preparation");
  for (const name of [
    "Передача учебных материалов",
    "Передача лицензий и документации",
    "Обучение преподавателей",
    "Актуализация учебной программы",
  ]) {
    await school
      .locator(".checklist-row")
      .filter({ hasText: name })
      .getByRole("button", { name: "Отметить", exact: true })
      .click();
    await dialogSave(school);
  }
  await uni.reload();
  await uni
    .getByRole("button", { name: "Документы", exact: false })
    .first()
    .click();
  await uni
    .getByRole("button", { name: "Загрузить документ", exact: true })
    .click();
  await uni.getByLabel("Тип документа").selectOption("signed_contract");
  await uni.locator("input[type=file]").setInputFiles({
    name: "signed.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nE2E synthetic agreement"),
  });
  await uni
    .getByRole("dialog")
    .getByRole("button", { name: "Загрузить", exact: true })
    .click();
  await expect(uni.getByRole("dialog")).toHaveCount(0);
  await uni
    .getByRole("button", { name: "Группы и обучение", exact: false })
    .click();
  await uni.getByRole("button", { name: "Создать группу" }).click();
  await uni.getByLabel("Название группы").fill("Поток E2E");
  await dialogSave(uni);
  await uni.getByRole("button", { name: "Участники и результаты" }).click();
  await uni.getByRole("button", { name: "Добавить", exact: true }).click();
  await uni.getByLabel("ФИО", { exact: true }).fill("Студент Примеров");
  await uni
    .getByLabel("Email", { exact: true })
    .fill("student-" + tag + "@example.test");
  await uni
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Сохранить", exact: true })
    .click();
  await expect(uni.getByLabel("ФИО", { exact: true })).toHaveCount(0);
  await uni.getByRole("button", { name: "Подтвердить список" }).click();
  await expect(
    uni.getByText("Список подтверждён", { exact: true }),
  ).toBeVisible();
  await school.reload();
  await changeStage(school, "training");
  await uni.getByRole("button", { name: "Закрыть", exact: true }).click();
  await uni.reload();
  await uni
    .getByRole("button", { name: "Группы и обучение", exact: false })
    .click();
  await uni.getByRole("button", { name: "Синхронизировать" }).click();
  await expect
    .poll(
      async () => {
        await uni.reload();
        await uni
          .getByRole("button", { name: "Группы и обучение", exact: false })
          .click();
        return await uni.locator(".group-numbers").textContent();
      },
      { timeout: 20000 },
    )
    .toContain("100%");
  await uni.getByRole("button", { name: "Участники и результаты" }).click();
  await expect(
    uni.getByRole("link", { name: "Сертификат", exact: true }),
  ).toBeVisible();
  const certificate = uni.waitForEvent("download");
  await uni.getByRole("link", { name: "Сертификат", exact: true }).click();
  expect((await certificate).suggestedFilename()).toContain("certificate");
  await school.reload();
  await changeStage(school, "evaluation");
  await changeStage(school, "completed");
  await uni.goto(dealPath);
  await uni.getByRole("button", { name: "Оставить отзыв" }).click();
  await uni
    .getByLabel("Ваше сообщение")
    .fill("Спасибо за практическую программу");
  await dialogSave(uni);
  await uni.getByRole("button", { name: "Запросить продолжение" }).click();
  await uni
    .getByLabel("Какая программа или группа вам нужна?")
    .fill("Ещё один поток");
  await dialogSave(uni);
  await school.reload();
  await school
    .getByRole("button", { name: "Создать сотрудничество", exact: true })
    .click();
  await dialogSave(school);
  await expect(
    school.getByRole("link", { name: /Продолжение #/ }),
  ).toBeVisible();
  await schoolContext.close();
  await uniContext.close();
});

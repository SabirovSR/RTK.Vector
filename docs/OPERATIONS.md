# Эксплуатация РТК Вектор

Приложение: https://vector.sabirov.tech. Сервер: Ubuntu 24.04, 139.100.233.90.
Публичные порты: 22, 80 (перенаправление), 443. PostgreSQL не публикуется. Mailpit и nginx доступны только на loopback.

## Доступ

На компьютере владельца создан отдельный ключ администратора:

```powershell
ssh -i "$env:USERPROFILE\.ssh\rtk_vector_admin" vector-admin@139.100.233.90
```

`vector-admin` имеет sudo. Root по SSH и вход по паролю отключены. Ключи SSH и `/etc/vector` не входят в репозиторий. Храните резервную копию административного ключа в менеджере секретов. Для аварийного восстановления доступа используйте консоль провайдера и восстановите `/etc/ssh/authorized_keys/vector-admin`.

Основной аккаунт CRM создаётся отдельно от демонстрационного набора. Его первоначальный пароль хранится локально в `%USERPROFILE%\.ssh\rtk-vector-ops\access.json`. Общедоступные демопароли на сервере не используются. Исходные персональные данные автоматически не импортируются.

## Обновление и CI/CD

GitHub Actions `CI and production` проверяет миграции PostgreSQL, бизнес-правила и права, сборку TypeScript, соответствие OpenAPI, зависимости и полный сценарий Playwright. После успешных проверок main публикуются два образа GHCR. Сервер загружает их по SHA256 digest.

Production environment содержит только отдельный SSH deploy key и закреплённый ключ хоста. Forced command принимает исключительно `deploy <commit SHA> <backend digest> <frontend digest>`. Этот пользователь не имеет shell, forwarding, доступа к Docker socket или общей команды sudo. Короткоживущий GITHUB_TOKEN передаётся по SSH stdin; Docker credential file удаляется после загрузки образов.

Настройки сервера меняются администратором, а не ключом приложения. Файлы из `infra` устанавливаются root; приложение не может изменять `/etc/vector` или compose. Изменения инфраструктуры в Git сами по себе не применяются на сервере.

Обновление создаёт backup, запускает миграции, ждёт healthchecks. При неуспехе возвращаются прежние образы. Автоматического отката схемы БД нет: миграции должны быть совместимы с предыдущей версией. При разрушительной миграции нужен отдельный план восстановления и окно обслуживания. Односерверный Compose допускает короткий перерыв при обновлении.

На сервере:

```bash
sudo docker compose --env-file /etc/vector/app.env --env-file /etc/vector/release.env -f /opt/vector/compose.production.yaml ps
sudo journalctl -u caddy -u vector-monitor.service --since '1 hour ago'
sudo docker compose --env-file /etc/vector/app.env --env-file /etc/vector/release.env -f /opt/vector/compose.production.yaml logs --tail 100 backend worker
```

## Подключение SMTP Яндекса

1. Создайте отдельный ящик для CRM или используйте существующий ящик Яндекса. В настройках Почты → Почтовые программы разрешите IMAP и пароли приложений.
2. В Яндекс ID → Безопасность → Пароли приложений создайте пароль для почты с названием «РТК Вектор». Обычный пароль аккаунта не используется.
3. Подключитесь к серверу по SSH, затем выполните `sudo /usr/local/sbin/vector-configure-mail`. Введите `smtp.yandex.ru`, `465`, `ssl`, полный адрес ящика и пароль приложения. Пароль вводится скрыто, в shell history не попадает.
4. Адрес From должен принадлежать этому ящику. Для обычного Яндекса используйте адрес `@yandex.ru`. Для `noreply@vector.sabirov.tech` сначала подключите доменную почту у провайдера.
5. Команда проверяет SMTP/TLS и авторизацию без отправки письма, затем сохраняет секрет в `/etc/vector/app.env` (0600) и пересоздаёт сервисы. Приглашение из карточки вуза проверит фактическую доставку. Ошибочные задания можно повторить на странице интеграций.

Пока SMTP не подключён, все письма остаются в закрытом Mailpit. Для просмотра:

```powershell
ssh -N -i "$env:USERPROFILE\.ssh\rtk_vector_admin" -L 8025:127.0.0.1:8025 vector-admin@139.100.233.90
```

Откройте http://localhost:8025. Mailpit временный, очищается при пересоздании контейнера. Это не доставка адресатам.

Официальная инструкция: https://yandex.ru/support/yandex-360/customers/mail/ru/mail-clients/others.
Другой SMTP также поддерживается: SSL или обязательный STARTTLS с проверкой сертификата. Для внешней SMTP-авторизации незашифрованное соединение запрещено.

## Резервные копии и восстановление

`vector-backup.timer` ежедневно в 03:15 UTC (+ до 10 минут) сохраняет pg_dump, документы и настройки в зашифрованный restic repository `/var/backups/vector/restic`. Хранятся 7 дневных, 4 недельных и 3 месячных копии. Пароль — `/etc/vector/restic-password`; его резервная копия на компьютере владельца, отдельно от данных. Перед каждым релизом также выполняется backup.

```bash
sudo /usr/local/sbin/vector-backup
sudo env RESTIC_REPOSITORY=/var/backups/vector/restic RESTIC_PASSWORD_FILE=/etc/vector/restic-password restic snapshots
sudo env RESTIC_REPOSITORY=/var/backups/vector/restic RESTIC_PASSWORD_FILE=/etc/vector/restic-password restic check
```

Для восстановления сначала остановите внешнюю запись (Caddy), backend и worker. Восстановите выбранный snapshot в отдельную директорию через `restic restore SNAPSHOT --target /root/vector-restore`. Проверьте файлы, настройки и digest версии. Восстановите `database.dump` командой `pg_restore --clean --if-exists --no-owner` в БД vector и распакуйте `documents.tar.gz` в volume `vector_documents`, сохранив UID 1000. Затем запустите соответствующие образы, проверьте `/api/v1/health` и вход, верните Caddy. Не выполняйте эти действия поверх работающей системы.

Локальные backup не защищают от потери всего VPS. Для регулярных независимых копий требуется отдельное S3/SFTP-хранилище с отдельными credentials и политикой удаления. Первоначальную зашифрованную копию можно забрать на компьютер, но это не заменяет регулярный offsite backup.

## Наблюдение и обновления ОС

Проверка health, заполнения диска (>85%) и возраста последнего backup (>26 часов) — `vector-monitor.timer` раз в 5 минут. Ошибка видна в systemd journal и failed units. Внешняя проверка доступности — GitHub Actions `Production availability` ежечасно. Включите уведомления о неуспешных Actions в личных настройках GitHub; отдельный круглосуточный on-call сервис не подключён.

Обновления безопасности ОС устанавливаются unattended-upgrades; автоматическая перезагрузка отключена. Проверяйте `/var/run/reboot-required` и планируйте перезагрузку. Журналы и контейнерные логи ограничены по размеру. Fail2ban защищает SSH, UFW разрешает только публичные порты. Ключи/токены меняются при подозрении на утечку.

Это технически защищённое размещение MVP. Организационные меры, правовая оценка обработки реальных персональных данных, отказоустойчивый кластер и полноценная эксплуатационная поддержка являются отдельными работами.

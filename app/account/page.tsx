import { promises as fs } from "fs";
import path from "path";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { getOrdersByUser, type OrderRow } from "@/lib/orders";
import { TARIFFS, type Tariff } from "@/lib/tariffs";
import { LogoutButton, RegenerateForm } from "./AccountActions";

export const dynamic = "force-dynamic";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: OrderRow["status"]): string {
  const labels: Record<OrderRow["status"], string> = {
    pending: "ожидает оплаты",
    generating: "генерируется",
    awaiting_manual: "в работе у дизайнера",
    done: "готово",
    error: "ошибка",
  };
  return labels[status];
}

async function hasLiveFile(order: OrderRow): Promise<boolean> {
  if (!order.file_path) return false;
  const fileName = order.file_path.split("/").pop();
  if (!fileName) return false;
  try {
    const stat = await fs.stat(path.join(process.cwd(), "public", "downloads", fileName));
    return stat.mtimeMs > Date.now() - env.DOWNLOADS_TTL_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const orders = await getOrdersByUser(user.id);
  const liveFiles = new Map<string, boolean>();
  await Promise.all(
    orders.map(async (order) => {
      liveFiles.set(order.id, await hasLiveFile(order));
    })
  );

  return (
    <main className="account-page">
      <nav className="account-nav">
        <a className="navbar-brand" href="/">Slide<span>maker</span></a>
        <div className="account-nav-actions">
          <span>{user.email}</span>
          <LogoutButton />
        </div>
      </nav>

      <section className="account-shell">
        <div className="account-head">
          <h1>Личный кабинет</h1>
          <p>История презентаций и бесплатная повторная генерация для оплаченных заказов.</p>
        </div>

        {orders.length === 0 ? (
          <div className="card account-empty">
            <strong>Заказов пока нет</strong>
            <span>Создайте презентацию на главной странице — она появится здесь после оплаты.</span>
            <a className="btn" href="/">Заказать презентацию</a>
          </div>
        ) : (
          <div className="account-list">
            {orders.map((order) => {
              const liveFile = liveFiles.get(order.id) ?? false;
              const canRegenerate =
                order.status === "done" && !order.regen_used && !order.parent_order_id;
              return (
                <article className="account-order" key={order.id}>
                  <div className="account-order-main">
                    <div>
                      <h2>{order.topic}</h2>
                      <div className="account-meta">
                        <span>{formatDate(order.created_at)}</span>
                        <span>{statusLabel(order.status)}</span>
                      </div>
                    </div>
                    {liveFile && order.file_path ? (
                      <a className="account-download" href={order.file_path}>
                        Скачать .pptx
                      </a>
                    ) : order.file_path ? (
                      <span className="account-expired">срок ссылки истёк</span>
                    ) : null}
                  </div>

                  {canRegenerate ? (
                    <RegenerateForm
                      orderId={order.id}
                      initialTopic={order.topic}
                      initialStyle={order.style}
                      initialSlideCount={order.slide_count}
                      maxSlides={
                        TARIFFS[order.tariff as Tariff["id"]]?.maxSlides ??
                        TARIFFS.basic.maxSlides
                      }
                    />
                  ) : order.regen_used ? (
                    <div className="field-hint">Повторная генерация уже использована.</div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

import { EventEmitter } from 'events';

export interface OrderNotificationData {
  id: string;
  orderId: string;
  customerName: string;
  totalAmount: number;
  sourceGroup: string;
  createdAt: string;
}

class NotificationServiceManager extends EventEmitter {
  private notifications: OrderNotificationData[] = [];
  private maxHistory = 50;

  /**
   * 當新訂單成立時，觸發廣播與紀錄
   */
  public notifyNewOrder(data: { orderId: string; customerName: string; totalAmount: number; sourceGroup?: string }) {
    const item: OrderNotificationData = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      orderId: data.orderId,
      customerName: data.customerName || '顧客',
      totalAmount: Number(data.totalAmount) || 0,
      sourceGroup: data.sourceGroup || '線上下單',
      createdAt: new Date().toISOString()
    };

    this.notifications.unshift(item);
    if (this.notifications.length > this.maxHistory) {
      this.notifications = this.notifications.slice(0, this.maxHistory);
    }

    this.emit('new_order', item);
  }

  /**
   * 取得指定時間戳之後的新通知 (分權限)
   */
  public getNotificationsSince(payload: any, user: any) {
    // 🛡️ 權限檢查：僅 BOSS 老闆角色具備瀏覽通知權限
    if (!user || user.role !== 'BOSS') {
      return { success: false, notifications: [], message: '權限不足 (僅 BOSS 老闆能接收通知)' };
    }

    const since = payload?.sinceTimestamp ? new Date(payload.sinceTimestamp).getTime() : 0;
    const filtered = this.notifications.filter(n => new Date(n.createdAt).getTime() > since);

    return {
      success: true,
      notifications: filtered,
      latestTimestamp: this.notifications[0]?.createdAt || new Date().toISOString()
    };
  }
}

export const NotificationService = new NotificationServiceManager();

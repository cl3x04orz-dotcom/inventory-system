/**
 * Enums.gs
 * Phase 2 系統列舉型別定義
 */

const Enums = {
    CommunityType: {
        APARTMENT: 'APARTMENT',
        HOUSE: 'HOUSE',
        OFFICE: 'OFFICE',
        PICKUP: 'PICKUP'
    },
    OrderingMode: {
        NORMAL: 'NORMAL',
        ALWAYS_OPEN: 'ALWAYS_OPEN'
    },
    CommunityStatus: {
        ACTIVE: 'ACTIVE',
        DISABLED: 'DISABLED',
        ARCHIVED: 'ARCHIVED'
    },
    CampaignType: {
        NORMAL: 'NORMAL',
        PREORDER: 'PREORDER',
        EVENT: 'EVENT',
        FLASHSALE: 'FLASHSALE'
    },
    CampaignStatus: {
        DRAFT: 'DRAFT',
        OPEN: 'OPEN',
        CLOSED: 'CLOSED',
        DELIVERING: 'DELIVERING',
        FINISHED: 'FINISHED',
        CANCELLED: 'CANCELLED'
    },
    AllowReorder: {
        YES: 'YES',
        NO: 'NO'
    },
    DeliveryStatus: {
        ORDER_RECEIVED: 'ORDER_RECEIVED',
        PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
        OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
        DELIVERED: 'DELIVERED',
        COMPLETED: 'COMPLETED',
        FAILED: 'FAILED',
        RETURNED: 'RETURNED'
    },
    PaymentMethod: {
        CASH: 'cash',
        WALLET: 'wallet',
        LINE_PAY: 'line_pay',
        TRANSFER: 'transfer'
    }
};

// 凍結物件避免意外修改
Object.keys(Enums).forEach(key => Object.freeze(Enums[key]));
Object.freeze(Enums);

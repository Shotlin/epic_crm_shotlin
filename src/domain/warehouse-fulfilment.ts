import type { RevenueOpsSnapshot, RevenueOpsState } from '../shared/revenue-ops-contracts';

export type FulfilmentReadiness = 'ready' | 'attention' | 'blocked';

export interface WarehouseFulfilmentLine {
  lineId: string;
  description: string;
  orderedQuantity: number;
  reservedQuantity: number;
  pickedQuantity: number;
  packedQuantity: number;
  shippedQuantity: number;
}

export interface WarehouseFulfilmentReadiness {
  orderId: string;
  orderNumber: string;
  readiness: FulfilmentReadiness;
  lines: WarehouseFulfilmentLine[];
  packageCount: number;
  blockers: string[];
  nextAction: 'reserve' | 'pick' | 'pack' | 'dispatch' | 'complete' | 'review';
}

type WarehouseFulfilmentSource = Pick<RevenueOpsSnapshot, 'scope' | 'salesOrders' | 'stockReservations' | 'warehouseTasks' | 'shipmentPackages' | 'shipmentEvents' | 'deliveryEvidence'>;

function inScope(state: WarehouseFulfilmentSource, record: { scope?: RevenueOpsState['scope'] }): boolean {
  const scope = record.scope ?? state.scope;
  return scope.companyId === state.scope.companyId && scope.branchId === state.scope.branchId;
}

/**
 * Read-only dispatch gate. It correlates order lines with reservation, pick,
 * package and delivery evidence without mutating stock or advancing a shipment.
 */
export function buildWarehouseFulfilmentReadiness(state: WarehouseFulfilmentSource): WarehouseFulfilmentReadiness[] {
  return state.salesOrders.filter((order) => order.status !== 'cancelled' && inScope(state, order)).map((order) => {
    const reservations = state.stockReservations.filter((reservation) => reservation.salesOrderId === order.id && inScope(state, reservation));
    const orderReservations = reservations.filter((reservation) => reservation.status !== 'released');
    const lines = order.lines.map((line) => {
      const lineReservations = orderReservations.filter((reservation) => reservation.lineId === line.id);
      const reservedQuantity = lineReservations.reduce((sum, reservation) => sum + reservation.quantity, 0);
      const pickedQuantity = lineReservations.filter((reservation) => ['packed', 'consumed'].includes(reservation.status)).reduce((sum, reservation) => sum + reservation.quantity, 0);
      const pickedReservationIds = new Set(lineReservations.filter((reservation) => ['packed', 'consumed'].includes(reservation.status)).map(({ id }) => id));
      const packedQuantity = state.shipmentPackages.filter((shipment) => shipment.salesOrderId === order.id && inScope(state, shipment)).flatMap((shipment) => shipment.items).filter((item) => item.lineId === line.id).reduce((sum, item) => sum + item.quantity, 0);
      const shippedQuantity = state.shipmentPackages.filter((shipment) => shipment.salesOrderId === order.id && inScope(state, shipment) && ['dispatched', 'in-transit', 'delivered', 'returned'].includes(shipment.status)).flatMap((shipment) => shipment.items).filter((item) => item.lineId === line.id).reduce((sum, item) => sum + item.quantity, 0);
      // A completed pick task is evidence of picked quantity only when it points to a reservation for this line.
      const taskPicked = state.warehouseTasks.filter((task) => task.type === 'pick' && task.status === 'completed' && inScope(state, task) && pickedReservationIds.has(task.sourceId)).reduce((sum, task) => sum + task.quantity, 0);
      return { lineId: line.id, description: line.description, orderedQuantity: line.quantity, reservedQuantity, pickedQuantity: Math.max(pickedQuantity, taskPicked), packedQuantity, shippedQuantity };
    });
    const blockers: string[] = [];
    if (lines.some((line) => line.reservedQuantity < line.orderedQuantity)) blockers.push('Reservation coverage is incomplete.');
    if (lines.some((line) => line.pickedQuantity < line.orderedQuantity)) blockers.push('Warehouse pick evidence is incomplete.');
    if (lines.some((line) => line.packedQuantity < line.orderedQuantity)) blockers.push('Package quantity does not cover every order line.');
    const packages = state.shipmentPackages.filter((shipment) => shipment.salesOrderId === order.id && inScope(state, shipment));
    if (!packages.length) blockers.push('No shipment package is linked.');
    if (packages.some((shipment) => ['planned', 'packed'].includes(shipment.status))) blockers.push('Shipment package is not ready for dispatch.');
    if (packages.some((shipment) => shipment.ewayBillRequired && !shipment.transportDocumentNumber && ['ready-to-dispatch', 'dispatched', 'in-transit', 'delivered'].includes(shipment.status))) blockers.push('Required e-way transport evidence is missing.');
    const delivered = lines.every((line) => line.shippedQuantity >= line.orderedQuantity) && lines.length > 0 && state.deliveryEvidence.some((evidence) => evidence.salesOrderId === order.id && inScope(state, evidence) && ['delivery', 'customer-acceptance'].includes(evidence.type));
    const readiness: FulfilmentReadiness = delivered ? 'ready' : blockers.length ? (blockers.some((blocker) => blocker.includes('Reservation') || blocker.includes('pick')) ? 'blocked' : 'attention') : 'ready';
    const nextAction: WarehouseFulfilmentReadiness['nextAction'] = blockers.some((blocker) => blocker.includes('Reservation')) ? 'reserve' : blockers.some((blocker) => blocker.includes('pick')) ? 'pick' : blockers.some((blocker) => blocker.includes('Package')) ? 'pack' : blockers.some((blocker) => blocker.includes('dispatch') || blocker.includes('e-way')) ? 'dispatch' : delivered ? 'complete' : 'review';
    return { orderId: order.id, orderNumber: order.number, readiness, lines, packageCount: packages.length, blockers: [...new Set(blockers)], nextAction };
  }).sort((left, right) => left.orderNumber.localeCompare(right.orderNumber));
}

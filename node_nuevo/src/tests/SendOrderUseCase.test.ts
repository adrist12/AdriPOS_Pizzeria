import assert from 'node:assert/strict';
import test from 'node:test';
import { Order, OrderItem } from '../domain/entities/Order.js';
import { KitchenStation } from '../domain/entities/kitchenEnums.js';
import { KitchenTicket } from '../domain/entities/KitchenTicket.js';
import { IKitchenRepository } from '../domain/repositories/IKitchenTicketRepository.js';
import { IOrderRepository } from '../domain/repositories/IOrderRepository.js';
import { CatalogProduct, IProductRepository, ProductStation } from '../domain/repositories/IProductRepository.js';
import { SendOrderUseCase } from '../application/use-cases/sendOrder.js';

const item: OrderItem = {
    productId: 'product-1',
    productName: 'Pizza',
    price: 100,
    quantity: 2,
    taxes: []
};

class InMemoryOrderRepository implements IOrderRepository {
    saved: Order[] = [];
    existing: Order | null = null;

    async findByTableId(): Promise<Order | null> {
        return this.existing;
    }

    async moveActiveOrder(): Promise<void> { }
    async payActiveOrder(): Promise<never> {
        throw new Error('Not implemented in this test double');
    }
    async save(order: Order): Promise<void> {
        this.saved.push(order);
    }

    async deleteByTableId(): Promise<void> { }
    async cancelActiveByTableId(): Promise<void> { }
    async removeItemByTableId(): Promise<void> { }
    async updateItemNotesByTableId(): Promise<void> { }
    async findItemCreatedAt(): Promise<Date | null> { return null; }
}

class InMemoryKitchenRepository implements IKitchenRepository {
    saved: KitchenTicket[] = [];

    async save(ticket: KitchenTicket): Promise<void> {
        this.saved.push(ticket);
    }

    async findActiveByStation() { return null; }
    async updateItemStatus(): Promise<void> { }
    async updateTableByActiveTickets(): Promise<void> { }
}

class InMemoryProductRepository implements IProductRepository {
    constructor(private readonly products: ProductStation[]) { }

    async findCatalog(): Promise<CatalogProduct[]> {
        return [];
    }

    async findStationByProductIds(): Promise<ProductStation[]> {
        return this.products;
    }
}

function createOrder(items: OrderItem[] = [item]): Order {
    return new Order({
        tableId: 'table-1',
        waiterName: 'Ana',
        waiterId: 'waiter-1',
        createdAt: new Date(),
        items
    });
}

test('SendOrderUseCase guarda la orden y crea el ticket con la estación del producto', async () => {
    process.env.KITCHEN_ATTRIBUTESET_PIZZAS = '14ec9589-7190-41e2-bdc6-6ecf9ff058be';
    const orderRepository = new InMemoryOrderRepository();
    const kitchenRepository = new InMemoryKitchenRepository();
    const productRepository = new InMemoryProductRepository([
        {
            productId: 'product-1',
            attributeSetId: '14ec9589-7190-41e2-bdc6-6ecf9ff058be'
        }
    ]);
    const useCase = new SendOrderUseCase(orderRepository, kitchenRepository, productRepository);

    await useCase.execute(createOrder());

    assert.equal(orderRepository.saved.length, 1);
    assert.equal(kitchenRepository.saved.length, 1);
    assert.equal(kitchenRepository.saved[0].Items[0].station, KitchenStation.PIZZAS);
    assert.equal(kitchenRepository.saved[0].Items[0].quantity, 2);
});

test('SendOrderUseCase reconoce las tres estaciones reales de Unicenta', async () => {
    process.env.KITCHEN_ATTRIBUTESET_PLANCHA = 'bb648310-9e05-402d-81e3-4bd2e39fbeda';
    process.env.KITCHEN_ATTRIBUTESET_PIZZAS_GRANDES = 'd96d5ecf-fe7c-41e5-96ff-57615ddd6777';
    process.env.KITCHEN_ATTRIBUTESET_PIZZAS = '14ec9589-7190-41e2-bdc6-6ecf9ff058be';

    const orderRepository = new InMemoryOrderRepository();
    const kitchenRepository = new InMemoryKitchenRepository();
    const productRepository = new InMemoryProductRepository([
        { productId: 'plancha-product', attributeSetId: 'bb648310-9e05-402d-81e3-4bd2e39fbeda' },
        { productId: 'pizza-grande-product', attributeSetId: 'd96d5ecf-fe7c-41e5-96ff-57615ddd6777' },
        { productId: 'pizza-product', attributeSetId: '14ec9589-7190-41e2-bdc6-6ecf9ff058be' }
    ]);
    const useCase = new SendOrderUseCase(orderRepository, kitchenRepository, productRepository);
    const order = createOrder([
        { ...item, productId: 'plancha-product' },
        { ...item, productId: 'pizza-grande-product' },
        { ...item, productId: 'pizza-product' }
    ]);

    await useCase.execute(order);

    assert.deepEqual(
        kitchenRepository.saved[0].Items.map((kitchenItem) => kitchenItem.station),
        [KitchenStation.PLANCHA, KitchenStation.PIZZAS_GRANDES, KitchenStation.PIZZAS]
    );
});

test('SendOrderUseCase conserva líneas iguales con opciones distintas y marca para llevar en cocina', async () => {
    process.env.KITCHEN_ATTRIBUTESET_PIZZAS = 'pizza-set';
    const orderRepository = new InMemoryOrderRepository();
    const kitchenRepository = new InMemoryKitchenRepository();
    const productRepository = new InMemoryProductRepository([
        { productId: 'pizza-1', attributeSetId: 'pizza-set' }
    ]);
    const useCase = new SendOrderUseCase(orderRepository, kitchenRepository, productRepository);

    await useCase.execute(createOrder([
        { ...item, productId: 'pizza-1', notes: 'Sin cebolla', takeaway: true },
        { ...item, productId: 'pizza-1', notes: 'Sin cebolla', takeaway: false }
    ]));

    const savedItems = orderRepository.saved[0].Items;
    const kitchenItems = kitchenRepository.saved[0].Items;
    assert.equal(savedItems.length, 2);
    assert.ok(savedItems[0].lineId);
    assert.ok(savedItems[1].lineId);
    assert.notEqual(savedItems[0].lineId, savedItems[1].lineId);
    assert.equal(kitchenItems.length, 2);
    assert.notEqual(kitchenItems[0].itemId, kitchenItems[1].itemId);
    assert.equal(kitchenItems[0].notes, 'PARA LLEVAR · Sin cebolla');
    assert.equal(kitchenItems[1].notes, 'Sin cebolla');
});

test('SendOrderUseCase rechaza productos sin estación configurada', async () => {
    const useCase = new SendOrderUseCase(
        new InMemoryOrderRepository(),
        new InMemoryKitchenRepository(),
        new InMemoryProductRepository([])
    );

    await assert.rejects(
        () => useCase.execute(createOrder()),
        /no tiene una estación de cocina configurada/i
    );
});

test('SendOrderUseCase no persiste nada si el attributeset_id no tiene mapeo', async () => {
    const orderRepository = new InMemoryOrderRepository();
    const kitchenRepository = new InMemoryKitchenRepository();
    const useCase = new SendOrderUseCase(
        orderRepository,
        kitchenRepository,
        new InMemoryProductRepository([{ productId: 'product-1', attributeSetId: 999 }])
    );

    await assert.rejects(
        () => useCase.execute(createOrder()),
        /No existe una estación para attributeset_id=999/i
    );
    assert.equal(orderRepository.saved.length, 0);
    assert.equal(kitchenRepository.saved.length, 0);
});

test('SendOrderUseCase conserva y actualiza los datos de domicilio en un pedido activo', async () => {
    const existingOrder = createOrder([]);
    const orderRepository = new InMemoryOrderRepository();
    orderRepository.existing = existingOrder;
    const useCase = new SendOrderUseCase(
        orderRepository,
        new InMemoryKitchenRepository(),
        new InMemoryProductRepository([
            {
                productId: 'product-1',
                attributeSetId: '14ec9589-7190-41e2-bdc6-6ecf9ff058be'
            }
        ])
    );
    process.env.KITCHEN_ATTRIBUTESET_PIZZAS = '14ec9589-7190-41e2-bdc6-6ecf9ff058be';

    await useCase.execute(new Order({
        tableId: 'table-1',
        waiterName: 'Ana',
        waiterId: 'waiter-1',
        createdAt: new Date(),
        items: [item],
        delivery: {
            customerName: 'Cliente',
            phone: '3001234567',
            address: 'Calle 1',
            deliveryFee: 7000
        }
    }));

    assert.deepEqual(existingOrder.Delivery, {
        customerName: 'Cliente',
        phone: '3001234567',
        address: 'Calle 1',
        deliveryFee: 7000
    });
});

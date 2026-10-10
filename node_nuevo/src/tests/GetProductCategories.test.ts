import assert from 'node:assert/strict';
import test from 'node:test';
import type {
    CatalogProduct,
    IProductRepository,
    ProductStation
} from '../domain/repositories/IProductRepository.js';
import { GetProductCategories } from '../application/use-cases/getProductCategories.js';

class InMemoryProductRepository implements IProductRepository {
    constructor(private readonly catalog: CatalogProduct[]) {}

    async findCatalog(): Promise<CatalogProduct[]> {
        return this.catalog;
    }

    async findStationByProductIds(_productIds: string[]): Promise<ProductStation[]> {
        return [];
    }
}

function product(
    productId: string,
    categoryId: string,
    categoryName: string,
): CatalogProduct {
    return {
        productId,
        name: `Product ${productId}`,
        price: 1000,
        taxes: [],
        categoryId,
        categoryName
    };
}

test('GetProductCategories groups actual UniCenta products without inventing categories', async () => {
    const useCase = new GetProductCategories(new InMemoryProductRepository([
        product('pizza-1', 'pizza', 'PIZZA'),
        product('drink-1', 'drinks', 'BEBIDAS'),
        product('pizza-2', 'pizza', 'PIZZA')
    ]));

    const categories = await useCase.execute();

    assert.deepEqual(categories.map((category) => ({
        id: category.id,
        name: category.name,
        productIds: category.products.map((entry) => entry.productId)
    })), [
        { id: 'pizza', name: 'PIZZA', productIds: ['pizza-1', 'pizza-2'] },
        { id: 'drinks', name: 'BEBIDAS', productIds: ['drink-1'] }
    ]);
});

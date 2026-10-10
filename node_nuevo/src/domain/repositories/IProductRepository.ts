import type { TaxInfo } from '../entities/Order.js';

export interface ProductStation {
    productId: string;
    attributeSetId: string | number;
}

export interface CatalogProduct {
    productId: string;
    name: string;
    price: number;
    taxes: TaxInfo[];
    categoryId: string;
    categoryName: string;
}

export interface CatalogCategory {
    id: string;
    name: string;
    products: CatalogProduct[];
}

export interface IProductRepository {
    findCatalog(): Promise<CatalogProduct[]>;
    findStationByProductIds(productIds: string[]): Promise<ProductStation[]>;
}
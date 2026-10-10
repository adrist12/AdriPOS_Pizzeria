import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { TaxInfo } from '../../../domain/entities/Order.js';
import { IProductRepository, ProductStation, CatalogProduct } from '../../../domain/repositories/IProductRepository.js';

interface ProductStationRow extends RowDataPacket {
    product_id: string;
    attribute_set_id: string | number;
}

interface CatalogProductRow extends RowDataPacket {
    product_id: string;
    product_name: string;
    price: number | string;
    category_id: string | null;
    category_name: string | null;
    tax_id: string | null;
    tax_name: string | null;
    tax_rate: number | string | null;
    tax_cascade: number | boolean | null;
    tax_category_id: string | null;
}

export class MySqlProductRepository implements IProductRepository {
    constructor(private readonly dbPool: Pool) { }

    async findCatalog(): Promise<CatalogProduct[]> {
        const query = `
            SELECT
                P.ID AS product_id,
                P.NAME AS product_name,
                P.PRICESELL AS price,
                C.ID AS category_id,
                C.NAME AS category_name,
                T.ID AS tax_id,
                T.NAME AS tax_name,
                T.RATE AS tax_rate,
                T.RATECASCADE AS tax_cascade,
                T.CATEGORY AS tax_category_id
            FROM PRODUCTS AS P
            LEFT JOIN CATEGORIES AS C ON C.ID = P.CATEGORY
            LEFT JOIN TAXES AS T ON T.CATEGORY = P.TAXCAT
            ORDER BY C.CATORDER, C.NAME, P.NAME, T.RATEORDER;
        `;
        const [rows] = await this.dbPool.execute<CatalogProductRow[]>(query);
        const productsById = new Map<string, CatalogProduct>();

        for (const row of rows) {
            let product = productsById.get(row.product_id);
            if (!product) {
                product = {
                    productId: row.product_id,
                    name: row.product_name,
                    price: Number(row.price),
                    taxes: [],
                    categoryId: row.category_id ?? 'uncategorized',
                    categoryName: row.category_name ?? 'Sin categoría'
                };
                productsById.set(row.product_id, product);
            }

            if (
                row.tax_id !== null &&
                row.tax_name !== null &&
                row.tax_rate !== null &&
                row.tax_category_id !== null
            ) {
                const tax: TaxInfo = {
                    taxId: row.tax_id,
                    name: row.tax_name,
                    rate: Number(row.tax_rate),
                    cascade: row.tax_cascade === true || Number(row.tax_cascade) === 1,
                    categoryId: row.tax_category_id
                };
                product.taxes.push(tax);
            }
        }

        return Array.from(productsById.values());
    }

    async findStationByProductIds(productIds: string[]): Promise<ProductStation[]> {
        if (productIds.length === 0) {
            return [];
        }

        const placeholders = productIds.map(() => '?').join(', ');
        const query = `
            SELECT id AS product_id, attributeset_id AS attribute_set_id
            FROM products
            WHERE id IN (${placeholders})
        `;
        const [rows] = await this.dbPool.execute<ProductStationRow[]>(query, productIds);

        return rows.map((row) => ({
            productId: row.product_id,
            attributeSetId: row.attribute_set_id
        }));
    }
}
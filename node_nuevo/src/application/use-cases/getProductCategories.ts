import type {
    CatalogCategory,
    IProductRepository
} from '../../domain/repositories/IProductRepository.js';

export class GetProductCategories {
    constructor(private readonly productRepository: IProductRepository) {}

    async execute(): Promise<CatalogCategory[]> {
        const products = await this.productRepository.findCatalog();
        const categories = new Map<string, CatalogCategory>();

        for (const product of products) {
            let category = categories.get(product.categoryId);
            if (!category) {
                category = {
                    id: product.categoryId,
                    name: product.categoryName,
                    products: []
                };
                categories.set(product.categoryId, category);
            }
            category.products.push(product);
        }

        return Array.from(categories.values());
    }
}

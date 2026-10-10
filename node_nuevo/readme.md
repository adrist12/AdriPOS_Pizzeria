-- -----------------------------------------------------
-- 1. Tabla: KITCHEN_TICKETS (Cabecera de comandas KDS)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS KITCHEN_TICKETS (
    id VARCHAR(36) NOT NULL,
    table_id VARCHAR(50) NOT NULL,
    waiter_name VARCHAR(100) NOT NULL,
    status ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- 2. Tabla: KITCHEN_ITEMS (Detalle de productos por Isla)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS KITCHEN_ITEMS (
    id VARCHAR(36) NOT NULL,
    ticket_id VARCHAR(36) NOT NULL, 
    product_name VARCHAR(150) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    station ENUM('PLANCHA', 'PIZZAS_GRANDES', 'PIZZAS') NOT NULL,
    status ENUM('PENDING', 'READY') NOT NULL DEFAULT 'PENDING',
    notes VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_kitchen_items_ticket 
        FOREIGN KEY (ticket_id) 
        REFERENCES KITCHEN_TICKETS(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- 3. Índices de Alto Rendimiento (Optimizados para hardware limitado)
-- -----------------------------------------------------

-- Búsqueda ultra rápida para pantallas KDS filtradas por Isla y Estado
CREATE INDEX idx_kds_station_status 
ON KITCHEN_ITEMS (station, status, ticket_id);

-- Búsqueda de tickets activos por mesa (útil para el cambio de mesa)
CREATE INDEX idx_kds_tickets_table_status 
ON KITCHEN_TICKETS (table_id, status);

-- Búsqueda rápida de ítems pertenecientes a un ticket específico
CREATE INDEX idx_kds_items_ticket 
ON KITCHEN_ITEMS (ticket_id);

-- -----------------------------------------------------
-- 4. Configuración del envío a cocina
-- -----------------------------------------------------
-- Los valores deben corresponder a PRODUCTS.ATTRIBUTESET_ID
-- de la instalación concreta de UnicentaPOS.
--
-- KITCHEN_ATTRIBUTESET_PLANCHA=...
-- KITCHEN_ATTRIBUTESET_PIZZAS_GRANDES=...
-- KITCHEN_ATTRIBUTESET_PIZZAS=...

-- -----------------------------------------------------
-- 5. Datos opcionales de domicilios
-- -----------------------------------------------------
-- Esta tabla conserva los datos del cliente y el costo de envío por fuera
-- del contenido serializado del ticket UniCenta. El total del ticket contiene
-- únicamente los productos; AdriPOS calcula por separado el total del cliente.
CREATE TABLE IF NOT EXISTS delivery_orders (
    ticket_id VARCHAR(255)
        CHARACTER SET utf8mb3
        COLLATE utf8mb3_general_ci
        NOT NULL,
    customer_name VARCHAR(150),
    phone VARCHAR(50),
    address VARCHAR(255),
    delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (ticket_id),
    CONSTRAINT fk_delivery_ticket
        FOREIGN KEY (ticket_id)
        REFERENCES sharedtickets (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- -----------------------------------------------------
-- 6. Cobro web y registro de ventas en UniCenta
-- -----------------------------------------------------
-- AdriPOS cobra órdenes activas mediante POST /api/orders/:tableId/pay.
-- El backend registra, dentro de una sola transacción, la venta en las tablas
-- oficiales de UniCenta: receipts, tickets, ticketlines y payments.
-- Las columnas opcionales de receipts (TABLEID, TABLENAME, attributes y
-- person), tickets y payments se detectan en ejecución; solo se insertan las
-- presentes. receipts requiere id, money y datenew; payments requiere id,
-- receipt, payment y total.
-- receipts debe incluir id, money y datenew para que UniCenta acepte la venta.
--
-- Requisitos operativos:
-- 1. La caja debe estar abierta desde UniCenta (closedcash.dateend IS NULL).
-- 2. La secuencia debe ser inequívoca: una secuencia alternativa activa en
--    ticketsnum (priority='alternative', status='Active'), o una única fila
--    con contador id en instalaciones antiguas sin code/serie.
-- 3. Las tablas de UniCenta y del KDS deben usar InnoDB para que la transacción
--    y el cambio de identificador de KITCHEN_TICKETS sean atómicos.
-- 4. Verifica que KITCHEN_ITEMS.ticket_id tenga ON UPDATE CASCADE, como en
--    la definición anterior.
--
-- Efectivo se registra como payment='cash'; Nequi se registra como
-- payment='bank'. Para domicilios, el ticket y el pago UniCenta incluyen
-- únicamente los productos. delivery_fee, el total cobrado, el efectivo
-- recibido, las vueltas y los datos del cliente quedan en los atributos del
-- recibo de AdriPOS y en delivery_orders mientras la orden está activa. En
-- esquemas antiguos sin serie, el número mostrado y guardado será el entero
-- asignado desde ticketsnum.id.
--
-- Antes de usar en producción, validar el ticket desde la interfaz/reportes de
-- UniCenta usando una copia de la base de datos. El backend no crea una caja
-- ni una secuencia automáticamente y rechazará el cobro si faltan o son
-- ambiguas.
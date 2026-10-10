import dotenv from "dotenv";
import express from "express";
import { Server } from 'socket.io';
import mysql from 'mysql2/promise';
import { createServer } from "http";
import cors from 'cors'


//Imports de casos de uso, adaptadores y Repositorios 
import { CreateOrderHandler } from "./OrderHandler.js";
import { CreateOrderUseCase } from "../../application/use-cases/createOrder.js";
import { JavaHttpTicketAdapter } from "./JavaHttpticketAdapter.js";
import { MySqlOrderRepository } from "../database/repositories/MySqlOrderRepository.js";
import { MySqlLoginRepository } from "../database/repositories/MySqlLoginRepository.js";
import { LoginUseCase } from "../../application/use-cases/login.js";
import { MoveOrderUseCase } from "../../application/use-cases/moveOrder.js";
import { PayOrderUseCase } from "../../application/use-cases/payOrder.js";
import { LoginHandler } from "./LoginHandler.js";
import { MySqlKitchenRepository } from "../database/repositories/MySqlKitchenRepository.js";
import { MySqlProductRepository } from "../database/repositories/MySqlProductRepository.js";
import { SendOrderUseCase } from "../../application/use-cases/sendOrder.js";
import { GetProductCategories } from "../../application/use-cases/getProductCategories.js";
import { MySqlTableRepository } from "../database/repositories/MySqlTableRepository.js";
import { createTableRoutes } from "./routes/TableRoutes.js";
import { createProductRoutes } from "./routes/ProductRoutes.js";
import { createOrderRoutes } from "./routes/OrderRoutes.js";
import { createKitchenDisplayRoutes } from "./routes/KitchenDisplayRoutes.js";
import { createKitchenPrintRoutes } from "./routes/KitchenPrintRoutes.js";
import { WindowsKitchenOrderPrinter } from "../printing/WindowsKitchenOrderPrinter.js";
import { PrintKitchenOrder } from "../../application/use-cases/printKitchenOrder.js";
import { requireAuth, verifyAuthToken } from "./authMiddleware.js";
import { getJwtSecret } from "../security/jwtSecret.js";
import { requireRole } from "./requireRole.js";
import { MySqlAccountingRepository } from "../database/repositories/MySqlAccountingRepository.js";
import { AccountingUseCases } from "../../application/use-cases/accounting.js";
import { createAccountingRoutes } from "./routes/AccountingRoutes.js";
import { assertProductionTransportConfiguration } from "../security/transportConfig.js";

dotenv.config();
getJwtSecret();
assertProductionTransportConfiguration(process.env);

const app = express();
const port = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';
const host = process.env.HOST || (isProduction ? '127.0.0.1' : '0.0.0.0');
const httpServer = createServer(app);
const allowedOrigins = (process.env.FRONTEND_ORIGINS ||
    'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const io = new Server(httpServer, {
    cors: { origin: allowedOrigins }
});

app.set('trust proxy', isProduction ? 'loopback' : false);
app.use((request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (isProduction) {
        if (!request.secure) {
            response.status(426).json({ message: 'HTTPS es obligatorio.' });
            return;
        }
        response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
io.use((socket, next) => {
    const forwardedProtocolHeader = socket.request.headers['x-forwarded-proto'];
    const forwardedProtocol = Array.isArray(forwardedProtocolHeader)
        ? forwardedProtocolHeader[0]
        : forwardedProtocolHeader?.split(',')[0]?.trim();
    if (
        isProduction &&
        forwardedProtocol !== 'https'
    ) {
        next(new Error('HTTPS es obligatorio.'));
        return;
    }
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || token.length === 0) {
        next();
        return;
    }

    try {
        socket.data.authUser = verifyAuthToken(token);
        socket.data.authToken = token;
        next();
    } catch {
        next(new Error('La sesión no es válida o ha expirado.'));
    }
});


const unicenta = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: requireEnvironmentVariable('DB_USER'),
    password: requireEnvironmentVariable('DB_PASSWORD'),
    database: process.env.DB_NAME || 'unicentaopos',
    waitForConnections: true,
    connectionLimit: 8 // Mínimo para bajos recursos
});
const accountingDatabase =
    process.env.ACCOUNTING_DB_NAME || process.env.DB_NAME2 || 'contabilidad_pizzeria';
const accounting = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: requireEnvironmentVariable('DB_USER'),
    password: requireEnvironmentVariable('DB_PASSWORD'),
    database: accountingDatabase,
    waitForConnections: true,
    connectionLimit: 4
});
const javaAdapter = new JavaHttpTicketAdapter(
    process.env.JAVA_ADAPTER_API || 'http://127.0.0.1:2000'
);

const mySqlRepository = new MySqlOrderRepository(unicenta, javaAdapter);
const accountingRepository = new MySqlAccountingRepository(accounting, unicenta);
const accountingUseCases = new AccountingUseCases(
    accountingRepository,
    process.env.ACCOUNTING_EDIT_PASSWORD
);
const orderUseCase = new CreateOrderUseCase(mySqlRepository);
const kitchenRepository = new MySqlKitchenRepository(unicenta);
const productRepository = new MySqlProductRepository(unicenta);
const getProductCategories = new GetProductCategories(productRepository);
const tableRepository = new MySqlTableRepository(unicenta);
const moveOrderUseCase = new MoveOrderUseCase(mySqlRepository, tableRepository);
const payOrderUseCase = new PayOrderUseCase(mySqlRepository);
const kitchenOrderPrinter = new WindowsKitchenOrderPrinter();
const printKitchenOrder = new PrintKitchenOrder(
    mySqlRepository,
    tableRepository,
    kitchenOrderPrinter
);
app.use('/api', requireAuth);
const accountingAdminRoleIds = (process.env.ACCOUNTING_ADMIN_ROLE_IDS || '0')
    .split(',')
    .map((roleId) => roleId.trim())
    .filter(Boolean);
app.use('/api/accounting', requireRole(...accountingAdminRoleIds));
app.use('/api', createTableRoutes(tableRepository));
app.use('/api', createAccountingRoutes(accountingUseCases));
app.use('/api', createProductRoutes(getProductCategories));
app.use('/api', createOrderRoutes(mySqlRepository, io, payOrderUseCase));
app.use('/api', createKitchenDisplayRoutes(kitchenRepository, io));
app.use('/api', createKitchenPrintRoutes(printKitchenOrder));
const sendOrderUseCase = new SendOrderUseCase(
    mySqlRepository,
    kitchenRepository,
    productRepository
);
const orderHandler = new CreateOrderHandler(io, orderUseCase, moveOrderUseCase, sendOrderUseCase);
const loginRepository = new MySqlLoginRepository(unicenta);
const loginUseCase = new LoginUseCase(loginRepository);
const loginHandler = new LoginHandler(loginUseCase);
//Eventos de red
io.on('connection', (socket) => {
    console.log(`[NETWORK] Mesero/Usuario conectado ID: ${socket.id}`)
    orderHandler.registerEvents(socket);
    loginHandler.registerEvents(socket);

    socket.on('disconnect', () => {
        console.log(`[NETWORK] Usuario desconectado ID: ${socket.id}`);
    });
});
//Encendido del puerto(Servidor)

httpServer.listen(Number(port), host, () => {
    console.log(`[SERVER] AdriPOS escuchando en ${isProduction ? '127.0.0.1' : `http://${host}`}:${port}`);
});

function requireEnvironmentVariable(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} debe configurarse; no se permiten credenciales por defecto.`);
    return value;
}
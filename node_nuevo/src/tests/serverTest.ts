import { io } from 'socket.io-client';
import { OrderItem, TaxInfo } from '../domain/entities/Order.js';

const socket = io('http://localhost:3001');
const tax: TaxInfo[] = [{
    taxId: "7733a42e-1e31-4824-a1fa-559935f63031",
    name: "IVA0",
    rate: 0.0,
    cascade: false,
    categoryId: "030646c1-10b6-4bb9-93ff-94aef608ae80"
}]
const items: OrderItem[] = [
    {
        productId: '3fed597b-cc0a-42b5-9463-b3c930ff5ca3',
        productName: 'PIZZA PORCION',
        price: 8500,
        quantity: 2,
        notes: 'Sin cebolla',
        taxes: tax

    },
    {
        productId: '3aadaca5-94ab-43f2-a985-b197c60a22c8',
        productName: 'HAMBURGUESA CORRIENTE',
        price: 12500,
        quantity: 5,
        taxes: tax
    }
];

socket.on('connect', () => {
    console.log('Conectado al servidor de prueba ID:', socket.id);

    //Emite un evento simulando entrada de datos
    socket.emit('order:addItem', {
        tableId: '1',
        waiterName: 'Administrator',
        createdAt: new Date(),
        items: items,
        waiterId: '0'
    });
});

socket.on('order:updated', (payload) => {
    console.log('Evento en tiempo real recibido: ', payload);

});
socket.on('seat:error', (error) => {
    console.error('❌ Error recibido:', error);
});
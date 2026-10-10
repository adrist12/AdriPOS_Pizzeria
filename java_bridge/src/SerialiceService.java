package src;

import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpExchange;
import com.unicenta.pos.ticket.*;

import java.io.OutputStream;
import java.io.InputStream;

import java.io.IOException;
import java.net.InetSocketAddress;
import src.JsonModels.Item;
import src.JsonModels.WebOrder;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 *
 * @author Adrian Acosta
 */

public class SerialiceService {
    private static final ObjectMapper mapper = new ObjectMapper();

    public static void main(String[] args) throws IOException {
        HttpServer server = HttpServer.create(
                new InetSocketAddress("127.0.0.1", 2000),
                0
        );

        server.createContext("/serialize", new SerializeHandler());
        server.createContext("/deserialize", new DeserializeHandler());

        server.setExecutor(java.util.concurrent.Executors.newFixedThreadPool(2));
        server.start();

        System.out.println("Puente Java disponible localmente en http://127.0.0.1:2000");
    }

    public static byte[] processJsonToBinary(InputStream requestBodyStream) throws Exception {
        // 1. Leemos todos los bytes recibidos de Node.js
        byte[] bytes = requestBodyStream.readAllBytes();
        String rawJson = new String(bytes, "UTF-8");

        // 💡 IMPRIMIR EN CONSOLA: Esto revela exactamente qué está enviando Node.js
        System.out.println("📩 JSON RECIBIDO DESDE NODE.JS:\n" + rawJson);

        // 2. Parseamos desde la cadena de texto
        WebOrder orderDTO = mapper.readValue(rawJson, WebOrder.class);

        TicketInfo ticket = new TicketInfo();
        ticket.setTicketType(TicketInfo.RECEIPT_NORMAL);

        if (orderDTO.items != null) {
            for (Item item : orderDTO.items) {
                String displayName = (item.productName != null && !item.productName.isEmpty())
                        ? item.productName
                        : "Producto";

                // Validar productId - si es null, generar uno
                String productId = (item.productId != null && !item.productId.isEmpty())
                        ? item.productId
                        : java.util.UUID.randomUUID().toString();

                // Obtener el impuesto del payload (si existe), si no, usar por defecto
                TaxInfo taxInfo = null;
                if (item.taxes != null && !item.taxes.isEmpty()) {
                    JsonModels.TaxInfoDto taxDto = item.taxes.get(0); // Usar el primer impuesto
                    taxInfo = new TaxInfo(
                            taxDto.taxId, // ID del impuesto
                            taxDto.name, // nombre
                            taxDto.categoryId, // categoría real (taxcategories.id) ← corregido
                            null, // categoría cliente
                            null, // impuesto padre
                            taxDto.rate,
                            taxDto.cascade,
                            null);
                } else {
                    // Impuesto por defecto si no viene en el payload
                    taxInfo = new TaxInfo(
                            "000", // ID
                            "EXCENTO", // nombre
                            "000", // categoría
                            null, // categoría cliente
                            null, // impuesto padre
                            0.0, // tasa
                            false, // cascade
                            null // orden
                    );
                }

                TicketLineInfo line = new TicketLineInfo(
                        productId,
                        displayName,
                        "000", 
                        "1",
                        item.quantity,
                        item.price,
                        taxInfo);

                if (item.notes != null) {
                    line.setProperty("notes", item.notes);
                }
                if (item.lineId != null) {
                    line.setProperty("lineId", item.lineId);
                }
                if (item.takeaway) {
                    line.setProperty("takeaway", "true");
                }
                ticket.addLine(line);
            }
        }
        return TicketUtils.serializeTicket(ticket);
    }

    static class SerializeHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }

            try (InputStream input = exchange.getRequestBody();
                    OutputStream responseBody = exchange.getResponseBody()) {

                byte[] processedResult = processJsonToBinary(input);

                exchange.getResponseHeaders().set("Content-Type", "application/octet-stream");
                exchange.sendResponseHeaders(200, processedResult.length);

                responseBody.write(processedResult);
                responseBody.flush();
            } catch (Exception e) {
                // IMPORTANTE: imprime la causa exacta en la consola de Java
                e.printStackTrace();

                String errorMessage = "{\"error\": \"" + e.getClass().getName() + ": " + e.getMessage() + "\"}";
                byte[] errorBytes = errorMessage.getBytes("UTF-8");

                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(500, errorBytes.length);

                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(errorBytes);
                }
            }
        }
    }

    static class DeserializeHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }

            try (InputStream input = exchange.getRequestBody();
                    OutputStream responseBody = exchange.getResponseBody()) {

                byte[] incomingBytes = input.readAllBytes();

                // 1. Des-serialización del BLOB nativo de unicentaPOS
                TicketInfo ticket = TicketUtils.deserialize(incomingBytes);

                // 2. Extracción de las líneas del ticket hacia tu estructura DTO
                java.util.List<JsonModels.Item> itemList = new java.util.ArrayList<>();

                if (ticket != null && ticket.getLines() != null) {
                    for (TicketLineInfo line : ticket.getLines()) {
                        JsonModels.Item dtoItem = new JsonModels.Item();
                        dtoItem.productId = line.getProductID();
                        dtoItem.lineId = line.getProperty("lineId");
                        if (dtoItem.lineId == null || dtoItem.lineId.isEmpty()) {
                            dtoItem.lineId = dtoItem.productId;
                        }
                        dtoItem.productName = line.printName();
                        dtoItem.price = line.getPrice();
                        dtoItem.quantity = line.getMultiply();
                        dtoItem.notes = line.getProperty("notes");
                        dtoItem.takeaway = Boolean.parseBoolean(line.getProperty("takeaway"));

                        TaxInfo lineTax = line.getTaxInfo();
                        if (lineTax != null) {
                            JsonModels.TaxInfoDto taxDto = new JsonModels.TaxInfoDto();
                            taxDto.taxId = lineTax.getId();
                            taxDto.name = lineTax.getName();
                            taxDto.rate = lineTax.getRate();
                            taxDto.cascade = lineTax.isCascade();
                            taxDto.categoryId = lineTax.getTaxCategoryID();
                            dtoItem.taxes = java.util.Collections.singletonList(taxDto);
                        }

                        itemList.add(dtoItem);
                    }
                }

                // 3. Conversión de la lista de ítems a texto JSON con Jackson
                String jsonOutput = mapper.writeValueAsString(itemList);
                byte[] jsonBytes = jsonOutput.getBytes("UTF-8");

                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, jsonBytes.length);

                responseBody.write(jsonBytes);
                responseBody.flush();
            } catch (Exception e) {
                String errorMessage = "{\"error\": \"" + e.getMessage() + "\"}";
                byte[] errorBytes = errorMessage.getBytes("UTF-8");

                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(500, errorBytes.length);

                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(errorBytes);
                }
            }
        }
    }
}
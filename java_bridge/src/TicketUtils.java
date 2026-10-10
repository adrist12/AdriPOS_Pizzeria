package src;
import com.unicenta.pos.ticket.TicketInfo;
import java.io.*;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;


/**
 *
 * @author Adrian Acosta
 */
public class TicketUtils {

    public static TicketInfo deserialize(byte[] data) throws Exception {
        try (ObjectInputStream ois =
                 new ObjectInputStream(new ByteArrayInputStream(data))) {
            return (TicketInfo) ois.readObject();
        }
    }

    public static byte[] serialize(Serializable o) throws Exception {
        try (ByteArrayOutputStream b = new ByteArrayOutputStream(); ObjectOutputStream oos = new ObjectOutputStream(b)) {
            oos.writeObject(o);
            return b.toByteArray();
        }
    }
    public static byte[] serializeTicket(TicketInfo ticket) throws Exception {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (ObjectOutputStream oos = new ObjectOutputStream(bos)) {
            oos.writeObject(ticket);
        }
        return bos.toByteArray();
    }
    static TicketInfo createNewTicket(Connection c, String mesaId, String mesaNombre) throws Exception {
        System.out.println("🆕 Creando ticket nuevo para mesa: " + mesaNombre + " (ID: " + mesaId + ")");

        String userId = "0";
        try (PreparedStatement psUser = c.prepareStatement(
                "SELECT ID FROM people WHERE NAME = 'Administrador' LIMIT 1"); ResultSet rsUser = psUser.executeQuery()) {
            if (rsUser.next()) {
                userId = rsUser.getString("ID");
            }
        }

        TicketInfo ticket = new TicketInfo();
        ticket.setDate(new java.util.Date());
        ticket.setTicketType(TicketInfo.RECEIPT_NORMAL);

        try (PreparedStatement ins = c.prepareStatement(
                "INSERT INTO sharedtickets (ID, NAME, CONTENT, APPUSER, PICKUPID) VALUES (?, ?, ?, ?, 0)")) {
            ins.setString(1, mesaId);
            ins.setString(2, mesaNombre);
            ins.setBytes(3, serialize(ticket));
            ins.setString(4, userId);
            ins.executeUpdate();
        }

        // ✅ Marcar la mesa como ocupada para que UniCenta la vea
        try (PreparedStatement updPlace = c.prepareStatement(
                "UPDATE places SET TICKETID = ?, OCCUPIED = ?, WAITER = ? WHERE ID = ?")) {
            updPlace.setString(1, mesaId);
            updPlace.setTimestamp(2, new java.sql.Timestamp(new java.util.Date().getTime()));
            updPlace.setString(3, "Administrador");
            updPlace.setString(4, mesaId);
            updPlace.executeUpdate();
        }

        System.out.println("✅ Ticket creado y mesa marcada como ocupada: " + mesaNombre);
        return ticket;
    }
}
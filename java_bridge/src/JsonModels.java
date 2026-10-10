package src;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Date;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 *
 * @author Adrian Acosta
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class JsonModels {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class WebOrder {

        @JsonProperty("table_id")
        public String tableId;
        public String waiterName;
        public Date createdAt;
        public List<Item> items;
        public String waiterId;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Item {

        public String lineId;
        public String productId;
        public String productName;
        public double price;
        public double quantity;
        public String notes;
        public boolean takeaway;
        public List<TaxInfoDto> taxes;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class TaxInfoDto {
        public String taxId;
        public String name;
        public double rate;
        public boolean cascade;
        public String categoryId; 
    }

}

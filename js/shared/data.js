(function () {
  var images = {
    rice: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=80",
    noodles: "https://images.unsplash.com/photo-1552611052-33e04de081de?auto=format&fit=crop&w=900&q=80",
    burger: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=900&q=80",
    drinks: "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=80",
    satay: "https://images.unsplash.com/photo-1529563021893-cc83c992d75d?auto=format&fit=crop&w=900&q=80",
    curry: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=900&q=80",
    salad: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80",
    dessert: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=900&q=80"
  };

  window.FoodSeed = {
    // Staff and admin accounts are created in Supabase Auth, never in frontend data.
    users: [],
    stalls: [
      {
        id: "stall-rice",
        name: "Nasi Corner",
        description: "Comfort rice plates with quick lunch sets.",
        image_url: images.rice,
        cuisine_type: "Rice",
        rating: 4.7,
        staff_id: "staff-001",
        wait_minutes: 12,
        closed: false,
        created_at: "2026-01-09T09:00:00.000Z",
        updated_at: "2026-01-09T09:00:00.000Z"
      },
      {
        id: "stall-noodle",
        name: "Wok Noodle Bar",
        description: "Hot noodles, soup bowls, and wok-fried specials.",
        image_url: images.noodles,
        cuisine_type: "Noodles",
        rating: 4.5,
        staff_id: "staff-001",
        wait_minutes: 10,
        closed: false,
        created_at: "2026-01-09T09:05:00.000Z",
        updated_at: "2026-01-09T09:05:00.000Z"
      },
      {
        id: "stall-grill",
        name: "Grill Station",
        description: "Burgers, satay, and grilled snacks.",
        image_url: images.burger,
        cuisine_type: "Grill",
        rating: 4.6,
        staff_id: "staff-001",
        wait_minutes: 15,
        closed: false,
        created_at: "2026-01-09T09:10:00.000Z",
        updated_at: "2026-01-09T09:10:00.000Z"
      },
      {
        id: "stall-drinks",
        name: "Fresh Sip",
        description: "Cold drinks, tea, coffee, and desserts.",
        image_url: images.drinks,
        cuisine_type: "Drinks",
        rating: 4.8,
        staff_id: "staff-001",
        wait_minutes: 5,
        closed: false,
        created_at: "2026-01-09T09:15:00.000Z",
        updated_at: "2026-01-09T09:15:00.000Z"
      }
    ],
    menu_items: [
      {
        id: "item-chicken-rice",
        stall_id: "stall-rice",
        name: "Hainan Chicken Rice",
        description: "Steamed chicken, fragrant rice, soup, cucumber, and chili sauce.",
        price: 8.9,
        image_url: images.rice,
        category: "Rice",
        available: true,
        stock_quantity: 18,
        created_at: "2026-01-09T09:30:00.000Z",
        updated_at: "2026-01-09T09:30:00.000Z"
      },
      {
        id: "item-nasi-lemak",
        stall_id: "stall-rice",
        name: "Nasi Lemak Ayam",
        description: "Coconut rice with fried chicken, sambal, egg, peanuts, and cucumber.",
        price: 10.5,
        image_url: "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=900&q=80",
        category: "Rice",
        available: true,
        stock_quantity: 14,
        created_at: "2026-01-09T09:31:00.000Z",
        updated_at: "2026-01-09T09:31:00.000Z"
      },
      {
        id: "item-curry-rice",
        stall_id: "stall-rice",
        name: "Curry Rice Set",
        description: "Rice bowl with chicken curry, vegetables, and crispy papadum.",
        price: 9.8,
        image_url: images.curry,
        category: "Rice",
        available: true,
        stock_quantity: 10,
        created_at: "2026-01-09T09:32:00.000Z",
        updated_at: "2026-01-09T09:32:00.000Z"
      },
      {
        id: "item-char-kuey-teow",
        stall_id: "stall-noodle",
        name: "Char Kuey Teow",
        description: "Wok-fried flat rice noodles with egg, prawns, and bean sprouts.",
        price: 9.5,
        image_url: images.noodles,
        category: "Noodles",
        available: true,
        stock_quantity: 16,
        created_at: "2026-01-09T09:33:00.000Z",
        updated_at: "2026-01-09T09:33:00.000Z"
      },
      {
        id: "item-pan-mee",
        stall_id: "stall-noodle",
        name: "Dry Pan Mee",
        description: "Handmade noodles with minced chicken, anchovies, egg, and chili.",
        price: 8.5,
        image_url: "https://images.unsplash.com/photo-1626804475297-41608ea09aeb?auto=format&fit=crop&w=900&q=80",
        category: "Noodles",
        available: true,
        stock_quantity: 12,
        created_at: "2026-01-09T09:34:00.000Z",
        updated_at: "2026-01-09T09:34:00.000Z"
      },
      {
        id: "item-laksa",
        stall_id: "stall-noodle",
        name: "Curry Laksa",
        description: "Rich curry noodle soup with tofu puff, chicken, and vegetables.",
        price: 10.2,
        image_url: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=80",
        category: "Noodles",
        available: true,
        stock_quantity: 9,
        created_at: "2026-01-09T09:35:00.000Z",
        updated_at: "2026-01-09T09:35:00.000Z"
      },
      {
        id: "item-beef-burger",
        stall_id: "stall-grill",
        name: "Classic Beef Burger",
        description: "Grilled beef patty, cheddar, lettuce, tomato, onion, and house sauce.",
        price: 12.9,
        image_url: images.burger,
        category: "Grill",
        available: true,
        stock_quantity: 11,
        created_at: "2026-01-09T09:36:00.000Z",
        updated_at: "2026-01-09T09:36:00.000Z"
      },
      {
        id: "item-satay",
        stall_id: "stall-grill",
        name: "Chicken Satay Set",
        description: "Six skewers with peanut sauce, cucumber, onion, and rice cake.",
        price: 11.4,
        image_url: images.satay,
        category: "Grill",
        available: true,
        stock_quantity: 20,
        created_at: "2026-01-09T09:37:00.000Z",
        updated_at: "2026-01-09T09:37:00.000Z"
      },
      {
        id: "item-salad",
        stall_id: "stall-grill",
        name: "Grilled Chicken Salad",
        description: "Greens, grilled chicken, cherry tomatoes, corn, and sesame dressing.",
        price: 10.9,
        image_url: images.salad,
        category: "Healthy",
        available: true,
        stock_quantity: 8,
        created_at: "2026-01-09T09:38:00.000Z",
        updated_at: "2026-01-09T09:38:00.000Z"
      },
      {
        id: "item-iced-tea",
        stall_id: "stall-drinks",
        name: "Iced Lemon Tea",
        description: "Freshly brewed tea with lemon and light syrup.",
        price: 3.9,
        image_url: images.drinks,
        category: "Drinks",
        available: true,
        stock_quantity: 30,
        created_at: "2026-01-09T09:39:00.000Z",
        updated_at: "2026-01-09T09:39:00.000Z"
      },
      {
        id: "item-milk-tea",
        stall_id: "stall-drinks",
        name: "Brown Sugar Milk Tea",
        description: "Cold milk tea with brown sugar syrup and pearls.",
        price: 6.5,
        image_url: "https://images.unsplash.com/photo-1558857563-b371033873b8?auto=format&fit=crop&w=900&q=80",
        category: "Drinks",
        available: true,
        stock_quantity: 15,
        created_at: "2026-01-09T09:40:00.000Z",
        updated_at: "2026-01-09T09:40:00.000Z"
      },
      {
        id: "item-dessert",
        stall_id: "stall-drinks",
        name: "Mango Dessert Cup",
        description: "Mango, cream, sago pearls, and chilled jelly cubes.",
        price: 7.2,
        image_url: images.dessert,
        category: "Dessert",
        available: true,
        stock_quantity: 7,
        created_at: "2026-01-09T09:41:00.000Z",
        updated_at: "2026-01-09T09:41:00.000Z"
      }
    ],
    tables: [
      {
        id: "table-t01",
        code: "T01",
        label: "Table 1",
        seats: 2,
        active: true
      },
      {
        id: "table-t02",
        code: "T02",
        label: "Table 2",
        seats: 4,
        active: true
      },
      {
        id: "table-t03",
        code: "T03",
        label: "Table 3",
        seats: 4,
        active: true
      },
      {
        id: "table-t04",
        code: "T04",
        label: "Table 4",
        seats: 6,
        active: true
      },
      {
        id: "table-t05",
        code: "T05",
        label: "Table 5",
        seats: 2,
        active: true
      },
      {
        id: "table-counter",
        code: "COUNTER",
        label: "Counter pickup",
        seats: 0,
        active: true
      }
    ],
    orders: [
      {
        id: "order-1001",
        customer_id: null,
        customer_name: "Guest Customer",
        customer_email: "guest@example.com",
        customer_phone: "0123456789",
        pickup_note: "Table 4",
        table_code: "T04",
        table_label: "Table 4",
        total_amount: 22.0,
        status: "Preparing",
        payment_status: "Paid",
        payment_method: "Sandbox Card",
        transaction_id: "SBX-1001",
        created_at: "2026-01-09T10:10:00.000Z",
        updated_at: "2026-01-09T10:15:00.000Z"
      }
    ],
    order_items: [
      {
        id: "orderitem-1001-a",
        order_id: "order-1001",
        menu_item_id: "item-chicken-rice",
        stall_id: "stall-rice",
        quantity: 1,
        price: 8.9,
        notes: "Less chili"
      },
      {
        id: "orderitem-1001-b",
        order_id: "order-1001",
        menu_item_id: "item-beef-burger",
        stall_id: "stall-grill",
        quantity: 1,
        price: 12.9,
        notes: ""
      }
    ],
    payments: [
      {
        id: "payment-1001",
        order_id: "order-1001",
        customer_id: null,
        amount: 22.0,
        payment_method: "Sandbox Card",
        status: "Paid",
        transaction_id: "SBX-1001",
        created_at: "2026-01-09T10:10:00.000Z"
      }
    ]
  };
})();

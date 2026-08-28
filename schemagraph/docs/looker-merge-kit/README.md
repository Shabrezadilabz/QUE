# Que Looker merge kit — sample repo layout

Drop these files into an existing Looker project (do not create a standalone project).

```
your-looker-repo/
├── views/
│   └── que/
│       ├── revenue_by_brand.view.lkml    ← from Que export
│       └── order_count.view.lkml
├── models/
│   └── your_model.model.lkml           ← add explore includes
└── README-QUE.md
```

## Model patch example

```lookml
explore: que_revenue_by_brand {
  view_name: revenue_by_brand
  description: "Que certified explore — merge only"
}
```

## API

```
GET /workspaces/{id}/export/looker/merge-kit?reportId=sportedge-exec
```

## Time target

Existing Looker shop merges Que views in **under 1 hour**.

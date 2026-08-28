view: revenue_by_brand {
  sql_table_name: que_marts.brand_revenue_mart ;;

  dimension: brand {
    type: string
    sql: ${TABLE}.brand ;;
  }

  measure: total_revenue {
    type: sum
    sql: ${TABLE}.revenue ;;
  }
}

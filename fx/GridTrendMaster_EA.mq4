//+------------------------------------------------------------------+
//|                                        GridTrendMaster_EA.mq4    |
//|            Универсальный Сеточный Советник (MT4)                 |
//+------------------------------------------------------------------+
#property copyright "Grid Backtester EA"
#property link      ""
#property version   "1.05"
#property strict

//--- Единицы измерения параметров
enum ENUM_STEP_UNIT
{
   UNIT_PIPS = 0,    // Пункты / Pips (авто-учет 5-го знака, например 20 = 20 pips)
   UNIT_POINTS = 1   // Пипсы / Points (минимальный тиковый шаг цены)
};

//--- Входные параметры: Настройки сетки
input string         s1 = "=== Параметры сетки ==="; // ---
input ENUM_STEP_UNIT InpStepUnit    = UNIT_PIPS; // Единица измерения параметров
input double         InpGridStep    = 20.0;      // Шаг сетки (Grid Step)
input double         InpTrendStep   = 100.0;     // Шаг тренда для ордеров со (*) (Trend Step)
input double         InpTakeProfit  = 100.0;     // Тейк-профит сетки (Take Profit)
input double         InpMinProfit   = 20.0;      // Мин. профит встречного закрытия (Min Profit)

//--- Входные параметры: Торговые настройки
input string         s2 = "=== Торговые настройки ==="; // ---
input double         InpLotSize     = 0.01;      // Объем базового лота (Lot Size)
input double         InpTrendLotMult= 2.0;       // Множитель лота для ордеров со (*) (Trend Lot Multiplier)
input int            InpSlippage    = 3;         // Допустимое проскальзывание (в пунктах)
input int            InpMagicNumber = 777123;    // Магический номер (Magic Number)
input string         InpComment     = "GridEA";  // Префикс комментария

//--- Структура для отслеживания экстремумов уровней сетки
struct LevelTracker
{
   double level;
   double minPrice;
   double maxPrice;
};

LevelTracker trackers[];
double       pipPoint;
double       prevPrice = 0;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   if(InpStepUnit == UNIT_PIPS)
   {
      if(_Digits == 3 || _Digits == 5)
         pipPoint = _Point * 10.0;
      else
         pipPoint = _Point;
   }
   else
   {
      pipPoint = _Point;
   }

   prevPrice = 0;
   ArrayFree(trackers);

   Print("[INIT] Советник инициализирован. Символ: ", _Symbol, ", Digits: ", _Digits, ", Размер пункта: ", DoubleToString(pipPoint, _Digits));
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   ArrayFree(trackers);
   Comment("");
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   if(!IsTradeAllowed()) return;

   double gridStepVal   = InpGridStep * pipPoint;
   double trendStepVal  = InpTrendStep * pipPoint;
   double takeProfitVal = InpTakeProfit * pipPoint;
   double minProfitVal  = InpMinProfit * pipPoint;

   if(gridStepVal <= 0) return;

   double currentPrice = MarketInfo(_Symbol, MODE_BID);

   if(prevPrice == 0)
   {
      prevPrice = currentPrice;
      UpdateAllTrackers(currentPrice, gridStepVal);
      PrintFormat("[INIT] Начальная цена: %s. Шаг сетки в цене: %s",
                  DoubleToString(currentPrice, _Digits), DoubleToString(gridStepVal, _Digits));
      return;
   }

   // 1. Проверка встречного закрытия ордеров со звездочкой (*)
   CheckCounterClose(minProfitVal);

   // 2. Определение и обработка пройденных уровней сетки
   if(NormalizeDouble(MathAbs(currentPrice - prevPrice), _Digits) > 0)
   {
      if(prevPrice < currentPrice) // Движение ВВЕРХ
      {
         double firstL = MathFloor(prevPrice / gridStepVal) * gridStepVal;
         double lastL  = MathFloor(currentPrice / gridStepVal) * gridStepVal;

         for(double v = firstL; v <= lastL + (gridStepVal * 0.5); v += gridStepVal)
         {
            double levelNorm = NormalizeDouble(v, _Digits);
            if(prevPrice < levelNorm && currentPrice >= levelNorm)
            {
               ProcessLevelCrossing(levelNorm, "UP", gridStepVal, trendStepVal, takeProfitVal);
            }
         }
      }
      else if(prevPrice > currentPrice) // Движение ВНИЗ
      {
         double firstL = MathCeil(prevPrice / gridStepVal) * gridStepVal;
         double lastL  = MathFloor(currentPrice / gridStepVal) * gridStepVal;

         for(double v = firstL; v >= lastL - (gridStepVal * 0.5); v -= gridStepVal)
         {
            double levelNorm = NormalizeDouble(v, _Digits);
            if(prevPrice > levelNorm && currentPrice <= levelNorm)
            {
               ProcessLevelCrossing(levelNorm, "DOWN", gridStepVal, trendStepVal, takeProfitVal);
            }
         }
      }

      // 3. Обновление трекеров цен для уровней
      UpdateAllTrackers(currentPrice, gridStepVal);
      prevPrice = currentPrice;
   }

   // Отображение информационной панели на графике
   DisplayInfo(gridStepVal, trendStepVal);
}

//+------------------------------------------------------------------+
//| Получение или создание индекса трекера для уровня               |
//+------------------------------------------------------------------+
int GetTrackerIndex(double level)
{
   level = NormalizeDouble(level, _Digits);
   int size = ArraySize(trackers);
   for(int i = 0; i < size; i++)
   {
      if(MathAbs(trackers[i].level - level) < _Point * 0.5)
         return i;
   }
   ArrayResize(trackers, size + 1);
   trackers[size].level = level;
   trackers[size].minPrice = 0;
   trackers[size].maxPrice = 0;
   return size;
}

//+------------------------------------------------------------------+
//| Обновление трекера для конкретного уровня                        |
//+------------------------------------------------------------------+
void UpdateTracker(double level, double currentPrice)
{
   int idx = GetTrackerIndex(level);

   if(currentPrice >= level)
   {
      trackers[idx].minPrice = currentPrice;
   }
   else
   {
      if(trackers[idx].minPrice == 0 || currentPrice < trackers[idx].minPrice)
         trackers[idx].minPrice = currentPrice;
   }

   if(currentPrice <= level)
   {
      trackers[idx].maxPrice = currentPrice;
   }
   else
   {
      if(trackers[idx].maxPrice == 0 || currentPrice > trackers[idx].maxPrice)
         trackers[idx].maxPrice = currentPrice;
   }
}

//+------------------------------------------------------------------+
//| Обновление всех трекеров в окрестности текущей цены             |
//+------------------------------------------------------------------+
void UpdateAllTrackers(double currentPrice, double gridStepVal)
{
   double minL = currentPrice - 50.0 * gridStepVal;
   double maxL = currentPrice + 50.0 * gridStepVal;

   double startLevel = MathFloor(minL / gridStepVal) * gridStepVal;
   double endLevel   = MathCeil(maxL / gridStepVal) * gridStepVal;

   for(double v = startLevel; v <= endLevel + (gridStepVal * 0.5); v += gridStepVal)
   {
      double levelNorm = NormalizeDouble(v, _Digits);
      UpdateTracker(levelNorm, currentPrice);
   }
}

//+------------------------------------------------------------------+
//| Проверка наличия открытого ордера с конкретным комментарием     |
//+------------------------------------------------------------------+
bool IsOrderOpen(string targetComment, int type)
{
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
      {
         if(OrderSymbol() == _Symbol && OrderMagicNumber() == InpMagicNumber)
         {
            if(OrderType() == type)
            {
               if(StringFind(OrderComment(), targetComment) >= 0)
                  return true;
            }
         }
      }
   }
   return false;
}

//+------------------------------------------------------------------+
//| Обработка пересечения уровня сетки                               |
//+------------------------------------------------------------------+
void ProcessLevelCrossing(double level, string direction, double gridStepVal, double trendStepVal, double takeProfitVal)
{
   int steps = (int)MathRound(takeProfitVal / gridStepVal);
   string stepsText = IntegerToString(steps);
   int trackerIdx = GetTrackerIndex(level);

   double trendLotSize = NormalizeDouble(InpLotSize * InpTrendLotMult, 2);
   double curBid = MarketInfo(_Symbol, MODE_BID);
   double curAsk = MarketInfo(_Symbol, MODE_ASK);

   string levelStr = DoubleToString(level, _Digits);
   string askStr   = DoubleToString(curAsk, _Digits);
   string bidStr   = DoubleToString(curBid, _Digits);

   Print("==================================================");
   PrintFormat("[СОБЫТИЕ] Пересечение уровня %s (%s) | Ask: %s | Bid: %s",
               levelStr, direction, askStr, bidStr);

   if(direction == "UP")
   {
      double minP = trackers[trackerIdx].minPrice;
      double reqMinGrid  = level - gridStepVal;
      double reqMinTrend = level - trendStepVal;

      // А. Обычная BUY сетка
      if(minP > 0 && minP <= reqMinGrid)
      {
         string gridComment = levelStr + "/" + stepsText + " BUY";
         if(!IsOrderOpen(gridComment, OP_BUY))
         {
            double tp = NormalizeDouble(curAsk + takeProfitVal, _Digits);
            int ticket = OrderSend(_Symbol, OP_BUY, InpLotSize, curAsk, InpSlippage, 0, tp, gridComment, InpMagicNumber, 0, clrBlue);
            if(ticket > 0)
               PrintFormat(">>> УСПЕШНО: Открыт Grid BUY #%d [Уровень: %s, Лот: %.2f, TP: %s]",
                           ticket, levelStr, InpLotSize, DoubleToString(tp, _Digits));
            else
               PrintFormat("!!! ОШИБКА открытия Grid BUY [%s]: Код ошибки = %d", gridComment, GetLastError());
         }
         else
         {
            PrintFormat("[ИНФО] Grid BUY на уровне %s уже открыт.", levelStr);
         }
      }
      else
      {
         PrintFormat("[ИНФО] Grid BUY на уровне %s НЕ открыт. Зафиксирован мин: %s (требовался откат <= %s)",
                     levelStr, DoubleToString(minP, _Digits), DoubleToString(reqMinGrid, _Digits));
      }

      // Б. Трендовый BUY ордер со звездочкой (*)
      if(minP > 0 && minP <= reqMinTrend)
      {
         string trendComment = levelStr + "* BUY";
         if(!IsOrderOpen(trendComment, OP_BUY))
         {
            int ticket = OrderSend(_Symbol, OP_BUY, trendLotSize, curAsk, InpSlippage, 0, 0, trendComment, InpMagicNumber, 0, clrGreen);
            if(ticket > 0)
               PrintFormat(">>> УСПЕШНО: Открыт Trend BUY (*) #%d [Уровень: %s, Лот: %.2f]",
                           ticket, levelStr, trendLotSize);
            else
               PrintFormat("!!! ОШИБКА открытия Trend BUY [%s]: Код ошибки = %d", trendComment, GetLastError());
         }
         else
         {
            PrintFormat("[ИНФО] Trend BUY (*) на уровне %s уже открыт.", levelStr);
         }
      }
      else
      {
         PrintFormat("[ИНФО] Trend BUY (*) на уровне %s НЕ открыт. Зафиксирован мин: %s (требовался глубокий откат <= %s)",
                     levelStr, DoubleToString(minP, _Digits), DoubleToString(reqMinTrend, _Digits));
      }
   }
   else if(direction == "DOWN")
   {
      double maxP = trackers[trackerIdx].maxPrice;
      double reqMaxGrid  = level + gridStepVal;
      double reqMaxTrend = level + trendStepVal;

      // А. Обычная SELL сетка
      if(maxP > 0 && maxP >= reqMaxGrid)
      {
         string gridComment = levelStr + "/" + stepsText + " SELL";
         if(!IsOrderOpen(gridComment, OP_SELL))
         {
            double tp = NormalizeDouble(curBid - takeProfitVal, _Digits);
            int ticket = OrderSend(_Symbol, OP_SELL, InpLotSize, curBid, InpSlippage, 0, tp, gridComment, InpMagicNumber, 0, clrRed);
            if(ticket > 0)
               PrintFormat(">>> УСПЕШНО: Открыт Grid SELL #%d [Уровень: %s, Лот: %.2f, TP: %s]",
                           ticket, levelStr, InpLotSize, DoubleToString(tp, _Digits));
            else
               PrintFormat("!!! ОШИБКА открытия Grid SELL [%s]: Код ошибки = %d", gridComment, GetLastError());
         }
         else
         {
            PrintFormat("[ИНФО] Grid SELL на уровне %s уже открыт.", levelStr);
         }
      }
      else
      {
         PrintFormat("[ИНФО] Grid SELL на уровне %s НЕ открыт. Зафиксирован макс: %s (требовался откат >= %s)",
                     levelStr, DoubleToString(maxP, _Digits), DoubleToString(reqMaxGrid, _Digits));
      }

      // Б. Трендовый SELL ордер со звездочкой (*)
      if(maxP > 0 && maxP >= reqMaxTrend)
      {
         string trendComment = levelStr + "* SELL";
         if(!IsOrderOpen(trendComment, OP_SELL))
         {
            int ticket = OrderSend(_Symbol, OP_SELL, trendLotSize, curBid, InpSlippage, 0, 0, trendComment, InpMagicNumber, 0, clrOrange);
            if(ticket > 0)
               PrintFormat(">>> УСПЕШНО: Открыт Trend SELL (*) #%d [Уровень: %s, Лот: %.2f]",
                           ticket, levelStr, trendLotSize);
            else
               PrintFormat("!!! ОШИБКА открытия Trend SELL [%s]: Код ошибки = %d", trendComment, GetLastError());
         }
         else
         {
            PrintFormat("[ИНФО] Trend SELL (*) на уровне %s уже открыт.", levelStr);
         }
      }
      else
      {
         PrintFormat("[ИНФО] Trend SELL (*) на уровне %s НЕ открыт. Зафиксирован макс: %s (требовался глубокий откат >= %s)",
                     levelStr, DoubleToString(maxP, _Digits), DoubleToString(reqMaxTrend, _Digits));
      }
   }
   Print("==================================================");
}

//+------------------------------------------------------------------+
//| Встречное закрытие ордеров со звездочкой (*)                     |
//+------------------------------------------------------------------+
void CheckCounterClose(double minProfitVal)
{
   bool foundMatch = true;

   while(foundMatch)
   {
      foundMatch = false;
      int total = OrdersTotal();

      for(int i = 0; i < total; i++)
      {
         if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
         if(OrderSymbol() != _Symbol || OrderMagicNumber() != InpMagicNumber) continue;

         string c1 = OrderComment();
         if(StringFind(c1, "*") < 0) continue;

         int ticket1       = OrderTicket();
         int type1         = OrderType();
         double openPrice1 = OrderOpenPrice();

         for(int j = 0; j < total; j++)
         {
            if(i == j) continue;
            if(!OrderSelect(j, SELECT_BY_POS, MODE_TRADES)) continue;
            if(OrderSymbol() != _Symbol || OrderMagicNumber() != InpMagicNumber) continue;

            string c2 = OrderComment();
if(StringFind(c2, "*") < 0) continue;

            int ticket2       = OrderTicket();
            double openPrice2 = OrderOpenPrice();

            double buyOpenPrice  = (type1 == OP_BUY) ? openPrice1 : openPrice2;
            double sellOpenPrice = (type1 == OP_SELL) ? openPrice1 : openPrice2;

            double ask = MarketInfo(_Symbol, MODE_ASK);
            double bid = MarketInfo(_Symbol, MODE_BID);

            double buyProfit  = bid - buyOpenPrice;
            double sellProfit = sellOpenPrice - ask;

            if(buyProfit >= minProfitVal && sellProfit >= minProfitVal)
            {
               PrintFormat("[ВСТРЕЧНОЕ ЗАКРЫТИЕ] Ордер #%d и Ордер #%d. BUY Профит: %s, SELL Профит: %s",
                           ticket1, ticket2, DoubleToString(buyProfit, _Digits), DoubleToString(sellProfit, _Digits));

               CloseOrder(ticket1);
               CloseOrder(ticket2);

               foundMatch = true;
               break;
            }
         }
         if(foundMatch) break;
      }
   }
}

//+------------------------------------------------------------------+
//| Закрытие ордера по тикету                                        |
//+------------------------------------------------------------------+
bool CloseOrder(int ticket)
{
   if(OrderSelect(ticket, SELECT_BY_TICKET, MODE_TRADES))
   {
      double closePrice = (OrderType() == OP_BUY) ? MarketInfo(_Symbol, MODE_BID) : MarketInfo(_Symbol, MODE_ASK);
      return OrderClose(ticket, OrderLots(), closePrice, InpSlippage, clrYellow);
   }
   return false;
}

//+------------------------------------------------------------------+
//| Вывод информации на график                                       |
//+------------------------------------------------------------------+
void DisplayInfo(double gridStepVal, double trendStepVal)
{
   int totalOrders = 0;
   double totalProfit = 0;

   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
      {
         if(OrderSymbol() == _Symbol && OrderMagicNumber() == InpMagicNumber)
         {
            totalOrders++;
            totalProfit += OrderProfit() + OrderSwap() + OrderCommission();
         }
      }
   }

   double curBid = MarketInfo(_Symbol, MODE_BID);

   // Расчет ближайших уровней сетки
   double lowerLevel = MathFloor(curBid / gridStepVal) * gridStepVal;
   double upperLevel = lowerLevel + gridStepVal;

   double nextUp, nextDown;
   if(MathAbs(curBid - lowerLevel) < _Point * 0.5)
   {
      nextUp   = lowerLevel + gridStepVal;
      nextDown = lowerLevel - gridStepVal;
   }
   else
   {
      nextUp   = upperLevel;
      nextDown = lowerLevel;
   }

   int idxUp   = GetTrackerIndex(nextUp);
   int idxDown = GetTrackerIndex(nextDown);

   double minP_Up   = trackers[idxUp].minPrice;
   double maxP_Down = trackers[idxDown].maxPrice;

   double reqMin_Up   = nextUp - gridStepVal;
   double reqMax_Down = nextDown + gridStepVal;

   string statusUp   = (minP_Up > 0 && minP_Up <= reqMin_Up) ? "ГОТОВ К BUY" : ("Нужен откат <= " + DoubleToString(reqMin_Up, _Digits));
   string statusDown = (maxP_Down > 0 && maxP_Down >= reqMax_Down) ? "ГОТОВ К SELL" : ("Нужен откат >= " + DoubleToString(reqMax_Down, _Digits));

   string text = "=====================================\n";
   text += "   УНИВЕРСАЛЬНЫЙ СЕТОЧНЫЙ СОВЕТНИК   \n";
   text += "=====================================\n";
   text += StringFormat("Символ: %s | Цена: %s\n", _Symbol, DoubleToString(curBid, _Digits));
   text += StringFormat("Лот: %.2f | Лот *: %.2f\n", InpLotSize, InpLotSize * InpTrendLotMult);
   text += StringFormat("Шаг сетки в цене: %s (в единицах: %.1f)\n", DoubleToString(gridStepVal, _Digits), InpGridStep);
   text += "-------------------------------------\n";
   text += StringFormat("Следующий уровень ВВЕРХ: %s\n", DoubleToString(nextUp, _Digits));
   text += StringFormat("  Мин. цена: %s | Статус: %s\n", DoubleToString(minP_Up, _Digits), statusUp);
   text += StringFormat("Следующий уровень ВНИЗ: %s\n", DoubleToString(nextDown, _Digits));
   text += StringFormat("  Макс. цена: %s | Статус: %s\n", DoubleToString(maxP_Down, _Digits), statusDown);
   text += "-------------------------------------\n";
   text += StringFormat("Открытых ордеров: %d\n", totalOrders);
   text += StringFormat("Плавающая прибыль: %.2f %s\n", totalProfit, AccountCurrency());
   text += "=====================================";

   Comment(text);
}